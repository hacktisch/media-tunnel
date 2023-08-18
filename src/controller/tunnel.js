const axios = require("axios");
const md5 = require("md5");
const sharp = require("sharp");
const AWS = require("aws-sdk");
const { Storage } = require("@google-cloud/storage");
const PassThrough = require("stream").PassThrough;

// Parsing environment variables and initializing constants
const { MAX_PARALLEL_TRANSFORMATIONS = 10, ALLOW_CUSTOM_TRANSFORMATIONS = '' } = process.env;
const transformParameters = ['w', 'h', 'q', 'f', 'p', 'o']
const presets = {};

for (let key in process.env) {
    if (key.startsWith('PRESET_')) {
        const presetKey = key.substring('PRESET_'.length).toLowerCase();
        presets[presetKey] = parseTransformationString(process.env[key]);
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

const saveCropIfNotAlreadyDoingIt = async (urlHash, { source, target, format, sourceFormat, transform, scale }) => {
    if (Object.keys(processingHashes).length > MAX_PARALLEL_TRANSFORMATIONS) {
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

        const { w: width, h: height, q: quality, f: fit, p: position } = transform;
        const resize = {
            fit,
            position
        };
        if (width) {
            resize.width = width * scale;
        }
        if (height) {
            resize.height = height * scale;
        }

        // Image transformation pipeline
        try {
            const response = await axios({
                method: "get", url: source, responseType: "arraybuffer"
            })

            if (format === "unknown") {
                const match = (response.headers["content-type"] || "").match(/^image\/(.*)$/i);
                if (match) {
                    format = match[1];
                } else {
                    format = "png";
                }
            }

            const transformation = sharp(response.data, {
                ...(~["gif", "webp"].indexOf(sourceFormat) ? {
                    animated: true
                } : {}),
                ...(~["jpeg"].indexOf(sourceFormat) ? {
                    failOn: 'truncated'
                } : {}),
            })
                .resize(resize)
                .withMetadata()
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
                }, closeProcess);
            } else if (process.env.CLOUD_PROVIDER === 'GCS') {
                const bucket = bucketProvider.bucket(process.env.BUCKET_NAME);
                const file = bucket.file(target);

                const writeStream = file.createWriteStream({
                    metadata: {
                        contentType: getMime(format)
                    }, resumable: false
                });

                writeStream.on('error', closeProcess);

                writeStream.on('finish', closeProcess);

                writeStream.end(Body);
            }
        } catch (e) {
            closeProcess();
        }
    }
};

function parseTransformationString(transformationString) {
    let transformations = transformationString.split(',');
    let transformation = {
        fit: "cover",
        position: "center"
    };
    for (let transform of transformations) {
        let [key, value] = transform.split(':');
        if (~transformParameters.indexOf(key)) {
            value = isNaN(value) ? value : parseInt(value);
            transformation[key] = value;
        }
    }
    return transformation;
}

// Exporting a module to serve media files
module.exports = {
    serveMedia: async ctx => {
        // Parsing parameters
        let { transformation, url } = ctx.params;
        let queryParams = ctx.query;
        const { accept = "" } = ctx.request?.header || {};

        transformation = transformation.toLowerCase();

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

        // Checking if the transformation is custom or preset
        let transform;
        if (presets[transformation]) {
            // Use preset transformation
            transform = presets[transformation];
        } else if (~['true', '1'].indexOf(ALLOW_CUSTOM_TRANSFORMATIONS.toLowerCase())) {
            // Parse the custom transformation if allowed
            transform = parseTransformationString(transformation);
        }

        // Checking for DPI scale in URL
        let scale = 1;
        const dpiScaleMatch = url.match(/^[1-3]x\//i);
        if (dpiScaleMatch) {
            scale = ~~dpiScaleMatch[0].slice(0, 1);
            url = url.slice(dpiScaleMatch[0].length);
        }

        let format;

        const castOutputMatch = url.match(/^(.*)\:o\.(.*)$/);

        let cast;
        if (castOutputMatch) {
            url = castOutputMatch[1];
            const newFormat = castOutputMatch[2];
            // Detect browser support
            if (accept.includes(getMime(newFormat))) {
                format = newFormat;
                cast = newFormat;
            }
        }

        // Constructing the requested URL
        const queryParamString = new URLSearchParams(queryParams).toString();
        const requestedUrl = `${url}${queryParamString ? '?' : ''}${queryParamString}`;

        // If no valid transformation was found, redirect to the original URL
        if (!transform) {
            ctx.redirect(requestedUrl);
            return;
        }

        // Hashing the URL to create a unique identifier
        const urlHash = md5(`${Object.keys(transform).sort().reduce((arr, key) => {
            arr.push(`${key}:${transform[key]}`);
            return arr;
        }, []).join(',')}/${scale}/${cast ? `${cast}/` : ''}${requestedUrl}`);

        if (!format) {
            format = queryParams.ext;
        }
        let sourceFormat;
        const parts = requestedUrl
            .split("/")
            .pop()
            .split(/[#?]/)[0]
            .split(".");
        if (parts.length >= 2) {
            const last = parts.pop().trim();
            if (last.length <= 4) {
                sourceFormat = last.toLowerCase();
            }
        }
        if (!sourceFormat) {
            sourceFormat = "unknown";
        }
        if (!format) {
            format = sourceFormat;
        }

        // Checking if the formats are one of the allowed formats
        for (const check of [format, sourceFormat]) {
            if (!~["png", "jpg", "jpeg", "gif", "webp", "avif", "unknown"].indexOf(check)) {
                ctx.redirect(requestedUrl);
                return;
            }
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
                .pipe(new PassThrough());

        } catch (error) {
            if (error.statusCode === 404 || error.code === 404) {

                // If the file does not exist, start the transformation and save the image to the bucket
                saveCropIfNotAlreadyDoingIt(urlHash, {
                    source: requestedUrl, target: fileName, format, sourceFormat, transform, scale
                });
                // Redirect to the original URL if the transformed image is not yet available
                return ctx.redirect(requestedUrl);
            } else {
                ctx.status = 500;
                ctx.body = 'Server error';
            }
        }
    }
};
