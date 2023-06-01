# Hacktisch Media Tunnel

This is a self-hosted image 'reverse-proxy', providing an alternative to Imgix, BunnyCDN Optimize, and Fastly by offering on-the-fly image optimization and cropping features. This tool allows you to optimize your images in real-time, while saving the requested image URLs to a cloud storage bucket. It's designed for a scalable Node.js backend, compatible with S3 compliant storage solutions like Amazon S3, DigitalOcean Spaces, and Google Cloud Storage.

This tool provides a cheaper alternative for real-time image processing, suitable for developers and businesses who need an affordable, flexible, and customizable image processing solution.

## Author

Merijn van Wouden\
[merijn@hacktis.ch](mailto:merijn@hacktis.ch)\
Github: [hacktisch](https://github.com/hacktisch)

## Features
On-the-fly image optimization and cropping.  
Support for multiple resolution scales (1x, 2x, 3x).  
Redirects visitors to the original image on the first request while the optimized version is being generated.  
Handles a configurable maximum of `MAX_PARALLEL_TRANSFORMATIONS` transformation processes in parallel.

### Supported file types
* (animated) gif
* (animated) webp
* png
* jpg/jpeg

## Usage

Format your image request URL as follows: \
`https://[domain]/[preset]/[remote_image_url]`

or with a DPI scale factor:\  
`https://[domain]/[preset]/[dpi_scale_factor]/[remote_image_url]`

where:
* `preset` is one of your preset configurations for width, height and quality (e.g., 200x200).
* `dpi_scale_factor` can be one of 1x, 2x, or 3x.
* `remote_image_url` is the URL of the image you want to optimize.  
  For example: `https://mydomain.com/200x200/2x/https://myimages.com/pic.jpg`

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
PRESET_200X200=w:200,h:200,q:80  
# Add as many presets as needed...  
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
After setting up your environment variables, you can run the server with npm start. The server will start on the port number provided in the PORT environment variable, or default to 3000 if PORT is not defined.

## Contributing
This project welcomes contributions from the community. Please read our contributing guide to get started.

## License
This project is open source under the MIT License.