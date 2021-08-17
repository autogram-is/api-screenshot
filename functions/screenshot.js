// Based on https://www.zachleat.com/web/automatic-opengraph/

const { builder } = require("@netlify/functions");
const chromium = require("chrome-aws-lambda");

function isFullUrl(url) {
  try {
    new URL(url);
    return true;
  } catch(e) {
    // invalid url OR local path
    return false;
  }
}

async function screenshot(url, format, viewportSize, dpr = 1, withJs = true) {
  const browser = await chromium.puppeteer.launch({
    executablePath: await chromium.executablePath,
    args: chromium.args,
    defaultViewport: {
      width: viewportSize[0],
      height: viewportSize[1],
      deviceScaleFactor: parseFloat(dpr),
    },
    headless: chromium.headless,
  });

  const page = await browser.newPage();

  if(!withJs) {
    page.setJavaScriptEnabled(false);
  }

  // TODO is there a way to bail at timeout and still show what’s rendered on the page?
  let response = await page.goto(url, {
    waitUntil: ["load", "networkidle0"],
    timeout: 8500
  });
  // let statusCode = response.status();
  // TODO handle 404/500 status codes better

  let options = {
    type: format,
    encoding: "base64"
  };

  if(format === "jpeg") {
    options.quality = 80;
  }

  let output = await page.screenshot(options);

  await browser.close();

  return output;
}

// Based on https://github.com/DavidWells/netlify-functions-workshop/blob/master/lessons-code-complete/use-cases/13-returning-dynamic-images/functions/return-image.js
async function handler(event, context) {
  // e.g. /https%3A%2F%2Fwww.11ty.dev%2F/small/1:1/smaller/
  let pathSplit = event.path.split("/").filter(entry => !!entry);
  let [url, size, aspectratio, zoom] = pathSplit;
  let format = "jpeg"; // hardcoded for now
  let viewport = [];

  // Manage your own frequency by using a _ prefix and then a hash buster string after your URL
  // e.g. /https%3A%2F%2Fwww.11ty.dev%2F/_20210802/ and set this to today’s date when you deploy
  if(size && size.startsWith("_")) {
    size = undefined;
  }
  if(aspectratio && aspectratio.startsWith("_")) {
    aspectratio = undefined;
  }
  if(zoom && zoom.startsWith("_")) {
    zoom = undefined;
  }

  // Set Defaults
  format = format || "jpeg";
  aspectratio = aspectratio || "1:1";
  size = size || "small";
  zoom = zoom || "standard";

  let dpr;
  if(zoom === "bigger") {
    dpr = 1.4;
  } else if(zoom === "smaller") {
    dpr = 0.71428571;
  } else if(zoom === "standard") {
    dpr = 1;
  }

  if(size === "small") {
    if(aspectratio === "1:1") {
      viewport = [375, 375];
    } else if(aspectratio === "9:16") {
      viewport = [375, 667];
    }
  } else if(size === "medium") {
    if(aspectratio === "1:1") {
      viewport = [650, 650];
    } else if(aspectratio === "9:16") {
      viewport = [650, 1156];
    }
  } else if(size === "large") {
    // 0.5625 aspect ratio not supported on large
    if(aspectratio === "1:1") {
      viewport = [1024, 1024];
    }
  } else if(size === "opengraph") {
    // ignores aspectratio
    // always maintain a 1200×630 output image
    if(zoom === "bigger") { // dpr = 1.4
      viewport = [857, 450];
    } else if(zoom === "smaller") { // dpr = 0.714
      viewport = [1680, 882];
    } else {
      viewport = [1200, 630];
    }
  }

  url = decodeURIComponent(url);

  try {
    if(!isFullUrl(url)) {
      throw new Error(`Invalid \`url\`: ${url}`);
    }

    if(!viewport || viewport.length !== 2) {
      throw new Error("Incorrect API usage. Expects one of: /:url/ or /:url/:size/ or /:url/:size/:aspectratio/")
    }

    let output = await screenshot(url, format, viewport, dpr);

    // output to Function logs
    console.log(url, format, { viewport }, { size }, { dpr }, { aspectratio });

    return {
      statusCode: 200,
      headers: {
        "content-type": `image/${format}`
      },
      body: output,
      isBase64Encoded: true
    };
  } catch (error) {
    console.log("Error", error);

    return {
      // We need to return 200 here or Firefox won’t display the image
      // HOWEVER a 200 means that if it times out on the first attempt it will stay the default image until the next build.
      statusCode: 200,
      headers: {
        "content-type": "image/svg+xml",
        "x-error-message": error.message
      },
      body: `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="${viewport[0]}" height="${viewport[1]}" x="0" y="0" viewBox="0 0 318 110" xml:space="preserve" aria-hidden="true" focusable="false"><defs><linearGradient id="a" x1="56.4%" x2="50%" y1="28.2%" y2="47.8%"><stop offset="0%" stop-color="#B2B2B2"/><stop offset="100%" stop-color="#D8D8D8"/></linearGradient><linearGradient id="b" x1="50%" x2="50%" y1="0%" y2="100%"><stop offset="0%" stop-color="#EEE"/><stop offset="100%" stop-color="#D8D8D8"/></linearGradient></defs><g fill="none" fill-rule="evenodd"><g class="logomark"><path fill="#0A0A0A" d="M94.5 0L110 55v55H0V0h94.5z"/><path fill="url(#a)" d="M18.2 0h20.3L20.3 64.5H0z" transform="translate(26.1 22.4)"/><path fill="url(#b)" d="M36.8 0h20.3L38.9 64.5H18.6z" transform="matrix(-1 0 0 1 101.8 22.4)"/></g><path class="wordmark" fill="#FFF" fill-rule="nonzero" d="M137.5 87c-.5 0-.7-.1-.7-.5l.1-.8 6.7-24.7c.1-.4.4-.6.7-.6h5.1c.4 0 .6.2.7.6l6.7 24.7.1.8c0 .4-.2.6-.7.6h-4c-.4 0-.6-.2-.8-.6l-1.1-4c-.2-.3-.3-.5-.6-.5h-5.8c-.3 0-.5.2-.6.6l-1 4c-.2.3-.4.5-.8.5h-4zm7.6-10.3h3.5c.2 0 .3-.2.3-.4l-1.8-9c0-.2 0-.3-.2-.3h-.1c-.2 0-.2 0-.2.3l-1.8 9c0 .2 0 .4.3.4zm24.1 10.8c-4.7 0-8.8-3.4-8.8-8.4V61c0-.3.3-.7.8-.7h3.8c.4 0 .8.4.8.8V79c0 1.7 1.3 3 3.4 3 2.2 0 3.5-1.3 3.5-3V61c0-.3.3-.7.8-.7h3.8c.4 0 .8.4.8.8V79c0 5-4.1 8.4-8.9 8.4zm19.8-.4a.8.8 0 01-.8-.8V66.1c0-.2-.1-.3-.4-.3h-4.7a.8.8 0 01-.8-.8v-3.8c0-.4.4-.8.8-.8h15.6c.4 0 .8.4.8.8V65c0 .4-.4.8-.8.8h-4.8c-.2 0-.3.1-.3.3v20.2c0 .4-.4.8-.8.8H189zm22.5.4c-4.1 0-7-2-8.3-5-1-2.3-1-5.1-1-8.7 0-3.7 0-6.5 1-8.7 1.4-3 4.2-5.1 8.3-5.1 4.1 0 7 2 8.3 5 1 2.3 1 5.1 1 8.7 0 3.7 0 6.5-1 8.7-1.4 3-4.2 5.1-8.3 5.1zm0-5.4c1.7 0 2.8-.6 3.4-1.8.5-1.1.5-4.1.5-6.6 0-2.4 0-5.4-.5-6.5-.6-1.2-1.7-1.8-3.4-1.8s-2.8.6-3.3 1.8c-.5 1.1-.6 4.1-.6 6.5 0 2.5 0 5.5.6 6.6.5 1.2 1.6 1.8 3.3 1.8zm23.7 5.4c-4.2 0-7.1-2-8.5-5-1-2.3-1-5.1-1-8.7 0-3.7 0-6.5 1-8.7 1.4-3 4.3-5.1 8.5-5.1 5 0 8.8 3.1 8.8 8.3 0 .5-.3.8-.7.8h-3.9c-.4 0-.8-.3-.8-.8 0-1.7-1.4-3-3.4-3-1.9 0-3 .7-3.6 1.9-.5 1.1-.5 4.1-.5 6.5 0 2.5 0 5.5.5 6.6.6 1.2 1.7 1.8 3.6 1.8 2.1 0 3.6-1 3.6-3.4v-.8c0-.2-.2-.4-.4-.4h-2.5a.8.8 0 01-.8-.7V73c0-.4.3-.7.8-.7h7.4c.4 0 .7.3.7.7v5.5c0 6-3.8 8.9-8.8 8.9zm15.4-.4a.8.8 0 01-.8-.8V61.2c0-.4.4-.8.8-.8h8.4c4.7 0 8 3.3 8 8 0 3-1.3 5.2-4 6.8-.3.1-.4.3-.4.5l.2.7 3.9 9 .2.8c0 .5-.4.9-1 .9h-3.8c-.5 0-.7-.2-1-.7l-3.9-9.5a.7.7 0 00-.7-.5h-1c-.2 0-.4.2-.4.4v9.5c0 .4-.3.8-.7.8h-3.8zm5-16h3.2c1.5 0 2.6-1.1 2.6-2.7 0-1.5-1-2.6-2.6-2.6h-3.3c-.2 0-.4.1-.4.3v4.6c0 .2.2.4.4.4zm15.2 16c-.5 0-.7-.2-.7-.6l.1-.8 6.7-24.7c0-.4.4-.6.7-.6h5.1c.3 0 .6.2.7.6l6.6 24.7.2.8c0 .4-.3.6-.8.6h-4c-.3 0-.6-.2-.7-.6l-1.2-4c0-.3-.2-.5-.5-.5h-5.8c-.4 0-.5.2-.6.6l-1 4c-.2.3-.4.5-.8.5h-4zm7.6-10.4h3.5c.2 0 .3-.2.3-.4l-1.8-9c0-.2-.1-.3-.2-.3h-.2l-.2.3-1.7 9c0 .2 0 .4.3.4zm17 10.4a.8.8 0 01-.8-.8V61.2c0-.4.4-.8.8-.8h5.6c.4 0 .7.2.8.7l3.9 17.1c0 .3.1.5.3.5.2 0 .3-.2.3-.5l4-17.1c0-.5.3-.7.7-.7h5.6c.4 0 .8.4.8.8v25.1c0 .4-.4.8-.8.8h-3.3a.8.8 0 01-.8-.8V71.1c0-.4 0-.5-.2-.5l-.3.3-3.7 15.5c-.1.5-.4.7-.8.7h-3c-.4 0-.7-.2-.8-.7L300 71c0-.2-.2-.3-.3-.3-.1 0-.2.1-.2.5v15.2c0 .4-.3.8-.8.8h-3.3z"/></g></svg>`,
      isBase64Encoded: false,
    };
  }
}

exports.handler = builder(handler);
