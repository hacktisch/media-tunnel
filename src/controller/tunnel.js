const axios = require("axios");
const md5 = require("md5");
const sharp = require("sharp");
const AWS = require("aws-sdk");
const {Storage} = require("@google-cloud/storage");
const PassThrough = require("stream").PassThrough;

// Parsing environment variables and initializing constants
const {MAX_PARALLEL_TRANSFORMATIONS = 10} = process.env;
const presets = {};
for (let key in process.env) {
    if (key.startsWith('PRESET_')) {
        const presetKey = key.substring('PRESET_'.length).toLowerCase();
        const values = process.env[key].split(',');
        const presetValue = {};
        for (let value of values) {
            let [subKey, subValue] = value.split(':');
            if (subKey === 'w') {
                presetValue['width'] = parseInt(subValue);
            } else if (subKey === 'h') {
                presetValue['height'] = parseInt(subValue);
            } else if (subKey === 'q') {
                presetValue['quality'] = parseInt(subValue);
            }
        }
        presets[presetKey] = presetValue;
    }
}

// Selecting a bucket provider according to the cloud provider set in environment variables
let bucketProvider;

if (process.env.CLOUD_PROVIDER === 'AWS') {
    const spacesEndpoint = new AWS.Endpoint(process.env.S3_ENDPOINT);
    bucketProvider = new AWS.S3({
        endpoint: spacesEndpoint, accessKeyId: process.env.S3_KEY, secretAccessKey: process.env.S3_SECRET
    });
} else if (process.env.CLOUD_PROVIDER === 'GCS') {
    bucketProvider = new Storage({
        projectId: process.env.GCS_PROJECT_ID, credentials: {
            client_email: process.env.GCS_CLIENT_EMAIL, private_key: process.env.GCS_PRIVATE_KEY.replace(/\\n/g, '\n')
        }
    });
}

// Helper function to get MIME type from format
const getMime = format => `image/${format}`;

// Active image transformation processes
const processingHashes = {};

// Handling image transformations
const saveCropIfNotAlreadyDoingIt = (urlHash, {source, target, format, transform, scale}) => {


    const activeTransforms = Object.keys(processingHashes).length;
    if (activeTransforms > MAX_PARALLEL_TRANSFORMATIONS) {
        return;
    }

    if (!processingHashes[urlHash]) {
        let automaticClose;

        const closeProcess = () => {
            clearTimeout(automaticClose);
            delete processingHashes[urlHash];
        };

        // Automatically dequeue if process gets stuck for whatever reason
        automaticClose = setTimeout(closeProcess, 30e3);
        processingHashes[urlHash] = true;

        const {width, height, quality} = transform;
        const resize = {};
        if (width) {
            resize.width = width * scale;
        }
        if (height) {
            resize.height = height * scale;
        }

        // Image transformation pipeline
        try {
            axios({
                method: "get", url: source, responseType: "arraybuffer"
            })
                .then(async response => {
                    if (format === "unknown") {
                        const match = (response.headers["content-type"] || "").match(/^image\/(.*)$/i);
                        if (match) {
                            format = match[1];
                        } else {
                            format = "png";
                        }
                    }


                    const transformation = sharp(response.data, ~["gif", "webp"].indexOf(format) ? {
                        animated: true
                    } : {})
                        .resize(resize)
                        .toFormat(format);
                    if (format === "jpeg") {
                        transformation.jpeg({
                            quality
                        });
                    }

                    const Body = await transformation.toBuffer();

                    // Checking the cloud provider and then performing appropriate bucket operations
                    if (process.env.CLOUD_PROVIDER === 'AWS') {
                        bucketProvider.putObject({
                            ACL: "public-read",
                            ContentType: getMime(format),
                            Body,
                            Bucket: process.env.BUCKET_NAME,
                            Key: target
                        }, function () {
                            closeProcess();
                        });
                    } else if (process.env.CLOUD_PROVIDER === 'GCS') {

                        const bucket = bucketProvider.bucket(process.env.BUCKET_NAME);
                        const file = bucket.file(target);

                        const writeStream = file.createWriteStream({
                            metadata: {
                                contentType: getMime(format)
                            }, resumable: false
                        });

                        writeStream.on('error', (err) => {
                            console.error('Error saving file to GCS:', err);
                            closeProcess();
                        });

                        writeStream.on('finish', () => {
                            closeProcess();
                        });

                        writeStream.end(Body);
                    }
                })
                .catch(e => {
                    console.error(e)
                    closeProcess();
                });
        } catch (e) {
            console.error(e)
            closeProcess();
        }
    }
};

// Exporting a module to serve media files
module.exports = {
    serveMedia: async ctx => {
        // Parsing parameters
        let {preset, url} = ctx.params;
        let queryParams = ctx.query;

        preset=preset.toLowerCase();

        // Checking if the URL is base64-encoded and decoding it
        const isBase64 = url.match(/^b64:(.*)$/i);
        if (isBase64) {
            try {
                url = isBase64[1];
                url = Buffer.from(url, "base64").toString();
                const parts = url.split("?");
                if (parts.length >= 2) {
                    url = parts[0];
                    queryParams = Object.fromEntries(new URLSearchParams(parts.slice(1).join("?")));
                }
            } catch (e) {
                console.error(e)
            }
        }

        // Checking if the requested URL is allowed
        const allowedUrls = process.env.ALLOWED_URLS && process.env.ALLOWED_URLS.split(',');

        if (allowedUrls) {
            let isUrlAllowed = false;

            for (let pattern of allowedUrls) {
                pattern = pattern.replace(/\*/g, '.*');
                const regex = new RegExp(`^${pattern}$`, 'i');
                if (regex.test(url)) {
                    isUrlAllowed = true;
                    break;
                }
            }

            if (!isUrlAllowed) {
                ctx.status = 403;
                ctx.body = 'URL is not allowed';
                return;
            }
        }

        // Checking if the preset is defined in environment variables
        if (!presets[preset]) {
            ctx.redirect(url);
            return;
        }

        // Checking for DPI scale in URL
        let scale = 1;
        const dpiScaleMatch = url.match(/^[1-3]x\//i);
        if (dpiScaleMatch) {
            scale = ~~dpiScaleMatch[0].slice(0, 1);
            url = url.slice(dpiScaleMatch[0].length);
        }

        // Constructing the requested URL
        const queryParamString = new URLSearchParams(queryParams).toString();
        const requestedUrl = `${url}?${queryParamString}`;

        // Hashing the URL to create a unique identifier
        const urlHash = md5(`${preset}/${scale}/${requestedUrl}`);
        let format = queryParams.ext;
        if (!format) {
            const parts = requestedUrl
                .split("/")
                .pop()
                .split(/[#?]/)[0]
                .split(".");
            if (parts.length >= 2) {
                const last = parts.pop().trim();
                if (last.length <= 4) {
                    format = last.toLowerCase();
                }
            }
            if (!format) {
                format = "unknown";
            }
        }

        // Checking if the format is one of the allowed formats
        if (!~["png", "jpg", "jpeg", "gif", "webp", "unknown"].indexOf(format)) {
            ctx.redirect(requestedUrl);
            return;
        }
        if (format === "jpg") {
            format = "jpeg";
        }

        // Constructing the filename for the transformed image
        const fileName = `${urlHash}${format ? `.${format}` : ""}`;

        // Checking if the file already exists in the bucket
        try {
            let params;
            if (process.env.CLOUD_PROVIDER === 'AWS') {
                params = {
                    Bucket: process.env.BUCKET_NAME, Key: fileName
                };
                await bucketProvider.headObject(params).promise();
            } else if (process.env.CLOUD_PROVIDER === 'GCS') {
                const bucket = bucketProvider.bucket(process.env.BUCKET_NAME);
                const file = bucket.file(fileName);
                await file.getMetadata();
            }

            let stream;
            if (process.env.CLOUD_PROVIDER === 'AWS') {
                stream = bucketProvider.getObject(params).createReadStream();
            } else if (process.env.CLOUD_PROVIDER === 'GCS') {
                const bucket = bucketProvider.bucket(process.env.BUCKET_NAME);
                const file = bucket.file(fileName);
                stream = file.createReadStream();
            }

            ctx.res.setHeader("Content-type", getMime(format));
            ctx.res.setHeader("Cache-Control", "public, max-age=31536000");
            ctx.body = stream
                .on("error", err => ctx.onerror(err))
                .pipe(PassThrough());

            return;
        } catch (e) {
            console.error(e)
        }

        // If the file does not exist, start the transformation and save the image to the bucket
        saveCropIfNotAlreadyDoingIt(urlHash, {
            source: requestedUrl, target: fileName, format, transform: presets[preset], scale
        });

        // Redirect to the original URL if the transformed image is not yet available
        ctx.redirect(requestedUrl);

    }
};