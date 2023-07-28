# Hacktisch Media Tunnel

This is a self-hosted image 'reverse-proxy' running on NodeJS, providing an alternative to Imgix, BunnyCDN Optimize, and Fastly by offering on-the-fly image optimization and cropping features. This tool allows you to optimize your images in real-time, while saving the requested image URLs to a cloud storage bucket. It's designed for a scalable Node.js backend, compatible with S3 compliant storage solutions like Amazon S3, DigitalOcean Spaces, and Google Cloud Storage.

This tool provides a cheaper alternative for real-time image processing, suitable for developers and businesses who need an affordable, flexible, and customizable image processing solution.

## Author

Merijn van Wouden\
[merijn@hacktis.ch](mailto:merijn@hacktis.ch)\
Github: [hacktisch](https://github.com/hacktisch)

## Features
On-the-fly image optimization and cropping.  
Support for multiple resolution scales (1x, 2x, 3x).  
Support for smart cropping position based on center of entropy or attention
Redirects visitors to the original image on the first request while the optimized version is being generated.  
Handles a configurable maximum of `MAX_PARALLEL_TRANSFORMATIONS` transformation processes in parallel.

### Supported file types
* (animated) gif
* (animated) webp
* png
* jpg/jpeg

## Usage

Format your image request URL as follows: \
`https://[domain]/[transformation]/[remote_image_url]`

or with a DPI scale factor:\
`https://[domain]/[transformation]/[dpi_scale_factor]/[remote_image_url]`

you can also cast the image into another format:\
`https://[domain]/[transformation]/[remote_image_url]:o.[format]`\
(for example `webp` or `avif`. the original format is served as a fallback when the requesting browser does not support the new format)

where:
* `transformation` can be either:
  * one of your preset configurations for width, height and quality (e.g., `THUMB`).
  * a custom transformation string (e.g., `w:200,h:200,q:80,p:attention,f:cover`); **(see Transformation String specification below)** only possible if `ALLOW_CUSTOM_TRANSFORMATIONS` is set to true.
* `dpi_scale_factor` can be one of 1x, 2x, or 3x.
* `remote_image_url` is the URL of the image you want to optimize.  
  For example: `https://mydomain.com/200x200/2x/https://myimages.com/pic.jpg`

### Transformation string

The transformation string is a comma-separated list of transformation options. The following parameters are supported:
* `w`: width in pixels
* `h`: height in pixels
* `q`: quality in percent
* `f`**(*)**: fit mode. Defaults to `cover`.
* `p`**(*)**: position of the crop. Defaults to `centre`.

*\*: Only relevant When both width and height are provided, the possible methods by which the image should **fit** these are:*

- `cover`: (default) Preserving aspect ratio, attempt to ensure the image covers both provided dimensions by cropping/clipping to fit.
- `contain`: Preserving aspect ratio, contain within both provided dimensions using "letterboxing" where necessary.
- `fill`: Ignore the aspect ratio of the input and stretch to both provided dimensions.
- `inside`: Preserving aspect ratio, resize the image to be as large as possible while ensuring its dimensions are less than or equal to both those specified.
- `outside`: Preserving aspect ratio, resize the image to be as small as possible while ensuring its dimensions are greater than or equal to both those specified.

When using a **fit** of `cover` or `contain`, the default **position** is `centre`. Other options are:
- position: `top`, `right top`, `right`, `right bottom`, `bottom`, `left bottom`, `left`, `left top`.
- gravity: `north`, `northeast`, `east`, `southeast`, `south`, `southwest`, `west`, `northwest`, `center` or `centre`.
- strategy: for `f:cover` only, dynamically crop using either the `entropy` or `attention` strategy.

The experimental strategy-based approach resizes so one dimension is at its target length
then repeatedly ranks edge regions, discarding the edge with the lowest score based on the selected strategy.
- `entropy`: focus on the region with the highest [Shannon entropy](https://en.wikipedia.org/wiki/Entropy_%28information_theory%29).
- `attention`: focus on the region with the highest luminance frequency, colour saturation and presence of skin tones.

## Setup
Clone this repository.  
Install the dependencies with `npm install`.  
Configure your environment variables. A sample `.env.example` file is provided. Copy this file to `.env` and replace the placeholder values with your actual values.

## Environment Variables

Your `.env` file should include the following:

```  
# Server port  
PORT=4444  
  
# Specify bucket and cloud provider. For DigitalOcean Spaces, use CLOUD_PROVIDER=AWS  
CLOUD_PROVIDER=<AWS or GCS>  
  
# AWS credentials. Specify S3_ENDPOINT when you use DigitalOcean Spaces, e.g. sgp1.digitaloceanspaces.com  
S3_ENDPOINT=<your_spaces_endpoint>  
S3_KEY=<your_spaces_access_key>  
S3_SECRET=<your_spaces_secret_key>  
  
# Google Cloud Storage credentials  
GCS_PROJECT_ID=<your_gcs_project_id>  
GCS_CLIENT_EMAIL=<your_gcs_client_email>  
GCS_PRIVATE_KEY=<your_gcs_private_key>  
  
# Presets
PRESET_THUMBNAIL=w:200,h:200,q:80,p:entropy
PRESET_BANNER=w:800,h:300,q:85,p:attention
PRESET_INLINE=h:60,q:85
PRESET_WITHIN_CONTAINER=h:100,w:100,f:inside
# Add as many presets as needed...

# Allow custom transformations
ALLOW_CUSTOM_TRANSFORMATIONS=false
```  
## GCS Private key

To obtain the GCS_PRIVATE_KEY for your Google Cloud Storage (GCS), you need to create a service account and generate a JSON key. Here are the steps:

1. Go to the Google Cloud Console: https://console.cloud.google.com
2. Choose the project you are using for GCS.
3. Click on the navigation menu (three horizontal lines at the top-left corner), then click on "IAM & Admin" -> "Service accounts".
4. Click on the "CREATE SERVICE ACCOUNT" button at the top of the page.
5. Fill in the details for the service account. You will need to specify the name, description, and role. For the role, you should select a role that gives the permissions you need. For example, you might choose the "Storage Admin" role for full control over GCS resources.
6. Click on "CREATE KEY" button. A dialog will open, select "JSON" as the key type.
7. Click on the "CREATE" button. The JSON key will be automatically downloaded to your computer.
8. Open the downloaded JSON file with a text editor. You will see a field named "private_key" in this file. This is your `GCS_PRIVATE_KEY`. The "client_email" is your `GCS_CLIENT_EMAIL`.

Be careful when adding this key to your `.env` file, as it often includes newline characters (\n). You'll need to replace all instances of `\n` with `\\n` to preserve the formatting within your `.env` file.

## Running the Server
After setting up your environment variables, you can run the server with npm start. The server will start on the port number provided in the `PORT` environment variable, or default to 4444 if `PORT` is not defined.

## Contributing
This project welcomes contributions from the community. Please read our contributing guide to get started.

## License
This project is open source under the MIT License.