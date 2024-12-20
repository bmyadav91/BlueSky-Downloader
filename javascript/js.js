// mobile nav hide show 
const humburg_icon = document.querySelector(".humburg_container .bi-list");
const mobile_nav_container = document.querySelector(".mobile_nav_links");
humburg_icon.addEventListener("click", function () {
    mobile_nav_container.classList.toggle("show");
});

// how to download video content hide and show 
const how_tow_dnd_header = document.querySelector(".documention_for_download_parent .header");
const how_to_dnd_content = document.querySelector(".documention_for_download_parent .content");
const show_hide_icon = document.querySelector(".documention_for_download_parent .hide_show .navigation_span_container i");
how_tow_dnd_header.addEventListener("click", function () {
    how_to_dnd_content.classList.toggle("show");
    if (show_hide_icon.classList.contains('bi-chevron-down')) {
        show_hide_icon.classList.remove('bi-chevron-down');
        show_hide_icon.classList.add('bi-chevron-up');
    } else {
        show_hide_icon.classList.add('bi-chevron-down');
        show_hide_icon.classList.remove('bi-chevron-up');
    }
});


// pass error here - in global varibale error_one
var dnd_submit_btn = document.querySelector('.dnd_button');
// dnd button disabled function 
function disable_dnd_btn() {
    dnd_submit_btn.disabled = true;
    dnd_submit_btn.innerText = "Fetching";
}
function enable_dnd_btn() {
    dnd_submit_btn.disabled = false;
    dnd_submit_btn.innerText = "Load Video";
}

// Hide ErrorMessageDisplay on click
const ErrorElement = document.querySelector('.error_message_parent');
const CloseBTN = ErrorElement.querySelector('.close_btn');

if (ErrorElement && CloseBTN) {
    CloseBTN.addEventListener('click', function () {
        ErrorElement.style.display = 'none';
    });
}

// Error Display Message
function ErrorDisplay(message) {
    try {
        const errorElement = document.querySelector('.error_message_parent');
        const messageDetails = errorElement.querySelector('.message_details');
        errorElement.style.display = 'flex';
        messageDetails.innerText = message;

        setTimeout(() => {
            errorElement.style.display = 'none';
            messageDetails.innerText = '';
        }, 5000);
    } catch (error) {
        console.error('Error displaying the message:', error);
    }
}






// ----------------------------------download section-------------------------------------

function extractPostInfo(url) {
    const match = url.match(/^https:\/\/bsky\.app\/profile\/([^/]+)\/post\/([^/]+)$/);
    if (match) {
        return {
            handle: match[1],
            rkey: match[2],
        };
    }
    ErrorDisplay('Invalid Bluesky post URL');
}

async function getDidFromHandle(handle) {
    const response = await fetch(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${handle}`);
    if (!response.ok) {
        ErrorDisplay(`Failed to resolve handle: ${handle}`);
    }
    const data = await response.json();
    return data.did;
}

async function getVideoInfoFromPost(did, rkey) {
    const postUri = `at://${did}/app.bsky.feed.post/${rkey}`;
    const encodedUri = encodeURIComponent(postUri);
    const response = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodedUri}&depth=0`);

    if (!response.ok) {
        ErrorDisplay(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const threadPost = data.thread.post;
    const embed = threadPost.embed;

    const createdAt = threadPost.record?.createdAt || threadPost.indexedAt || new Date().toISOString();
    const posterHandle = threadPost.author.handle;

    if (embed && embed.$type === 'app.bsky.embed.video#view') {
        return {
            playlist: embed.playlist,
            thumbnail: embed.thumbnail,
            handle: posterHandle,
            createdAt
        };
    }
    ErrorDisplay('Unbale to get video embed');
    return null;
}

function parseHighestQualityVideoUrl(masterPlaylist, baseUrl) {
    const lines = masterPlaylist.split('\n');

    let highestBandwidth = 0;
    let highestQualityUrl = '';

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
            const bandwidthMatch = lines[i].match(/BANDWIDTH=(\d+)/);
            if (bandwidthMatch) {
                const bandwidth = parseInt(bandwidthMatch[1]);
                if (bandwidth > highestBandwidth) {
                    highestBandwidth = bandwidth;
                    highestQualityUrl = lines[i + 1];
                }
            }
        }
    }

    return new URL(highestQualityUrl, baseUrl).toString();
}

function parseSegmentUrls(videoPlaylist, baseUrl) {
    return videoPlaylist.split('\n')
        .filter(line => !line.startsWith('#') && line.trim() !== '')
        .map(segment => new URL(segment, baseUrl).toString());
}

async function downloadSegments(segmentUrls, progressCallback) {
    const chunks = [];
    const totalSegments = segmentUrls.length;

    for (let i = 0; i < totalSegments; i++) {
        const url = segmentUrls[i];
        const response = await fetch(url);
        const chunk = await response.arrayBuffer();
        chunks.push(chunk);

        progressCallback((i + 1) / totalSegments);
    }

    return chunks;
}



async function downloadAndProcessVideo(masterPlaylistUrl, progressCallback) {
    let format = 'mp4';
    const masterPlaylistResponse = await fetch(masterPlaylistUrl);
    const masterPlaylist = await masterPlaylistResponse.text();

    const videoPlaylistUrl = parseHighestQualityVideoUrl(masterPlaylist, masterPlaylistUrl);
    const videoPlaylistResponse = await fetch(videoPlaylistUrl);
    const videoPlaylist = await videoPlaylistResponse.text();

    const segmentUrls = parseSegmentUrls(videoPlaylist, videoPlaylistUrl);
    const chunks = await downloadSegments(segmentUrls, progressCallback);

    const mimeType = format === 'mp4' ? 'video/mp4' : 'video/MP2T';
    return new Blob(chunks, { type: mimeType });
}


async function processBlueskyVideo(postUrl, progressCallback) {
    try {
        const { handle, rkey } = extractPostInfo(postUrl);
        const did = await getDidFromHandle(handle);
        const videoInfo = await getVideoInfoFromPost(did, rkey);

        if (!videoInfo) {
            ErrorDisplay('No video found in the post');
        }
        const videoBlob = await downloadAndProcessVideo(videoInfo.playlist, progressCallback);
        return {
            videoBlob,
            thumbnailUrl: videoInfo.thumbnail,
            handle: videoInfo.handle,
            createdAt: videoInfo.createdAt
        };

    } catch (error) {
        ErrorDisplay(`Error: ${error.message || error}`);
        console.error('Error:', error);
        throw error;
    }
}


function sanitizeFilename(name) {
    return name.replace(/[^a-z0-9_\-]/gi, '_');
}

function formatDateForFilename(date) {
    const pad = (n) => n.toString().padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return `${day}${month}${year}_${hours}${minutes}${seconds}`;
}




document.getElementById('download_threads_media_frm').addEventListener('submit', async (e) => {
    e.preventDefault();
    disable_dnd_btn();

    const postUrl = document.getElementById('url').value;
    const progressBar = document.getElementById('progress_bar');
    const progressBarInner = progressBar.querySelector('div');
    const thumbnail = document.querySelector('.thumbnail');
    const downloadLink = document.querySelector('.download_link');
    const DownloadOutputArea = document.querySelector('.fetched_media_container');

    try {
        const result = await processBlueskyVideo(postUrl, (progress) => {
            progressBar.style.display = 'block';
            progressBarInner.style.width = `${progress * 100}%`;
        });

        const { videoBlob, thumbnailUrl, handle, createdAt } = result;

        if (thumbnail) thumbnail.src = thumbnailUrl;
        if (DownloadOutputArea) DownloadOutputArea.style.display = 'flex';

        const sanitizedHandle = sanitizeFilename(handle || 'bluesky');
        const formattedDate = formatDateForFilename(new Date(createdAt || Date.now()));
        const filename = `${sanitizedHandle}_${formattedDate}.mp4`;

        const url = URL.createObjectURL(videoBlob);
        if (downloadLink) {
            downloadLink.href = url;
            downloadLink.download = filename;
        }

        enable_dnd_btn();
        progressBar.style.display = 'none';
    } catch (error) {
        enable_dnd_btn();
        ErrorDisplay(`Error: ${error.message || error}`);
        console.error('Error:', error);
    }
});

// ---------------------------------------lazy load----------------------------------------
document.addEventListener("DOMContentLoaded", function () {
    let images = document.querySelectorAll("img");

    if ("IntersectionObserver" in window) {
        let observer = new IntersectionObserver(function (entries, observer) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    let image = entry.target;
                    if (image.getAttribute("src") && image.getAttribute("data-src")) {
                        image.src = image.getAttribute("data-src");
                        image.removeAttribute("data-src");
                    }
                    observer.unobserve(image);
                }
            });
        });

        images.forEach(function (image) {
            if (image.getAttribute("src") && image.getAttribute("data-src")) {
                observer.observe(image);
            }
        });
    } else {
        // Fallback for browsers without Intersection Observer support
        images.forEach(function (image) {
            if (image.getAttribute("src") && image.getAttribute("data-src")) {
                image.src = image.getAttribute("data-src");
                image.removeAttribute("data-src");
            }
        });
    }
});

// trigger share 
document.querySelector('.bi-share').addEventListener('click', function () {
    if (navigator.share) {
        const url = new URL(window.location.href);
        const domainOnly = url.origin;

        const title = document.title || 'AAAeNOS';
        const metaDescriptionTag = document.querySelector('meta[name="description"]');
        const metaDescription = metaDescriptionTag ? metaDescriptionTag.content : 'AAAeNOS';

        const shareData = {
            title: title,
            text: metaDescription,
            url: domainOnly
        };

        navigator.share(shareData)
            .then(() => {
                console.log('Thanks for sharing!');
            })
            .catch((error) => {
                console.error('Error sharing:', error);
            });
    } else {
        ErrorDisplay('Oh! Your device or browser does not support the Share API')
    }
});