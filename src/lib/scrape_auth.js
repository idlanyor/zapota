/**
 * Facebook Authenticated Scraper (Node.js)
 * Mengambil metadata profil & detail postingan (caption, tanggal, gambar, likes, comments, shares, url)
 * dan mengembalikannya dalam format JSON terstruktur.
 */

import fs from "node:fs";

/**
 * Parsing file cookies.txt (format Netscape)
 */
function parseNetscapeCookies(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File cookie "${filePath}" tidak ditemukan.`);
  }
  const content = fs.readFileSync(filePath, "utf-8");
  const cookiePairs = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length >= 7) {
      cookiePairs.push(`${parts[5]}=${parts[6]}`);
    }
  }

  return cookiePairs.join("; ");
}

/**
 * Resolve Facebook shortlink / share URL ke URL tujuan asli
 */
async function resolveShareUrl(shareUrl) {
  const res = await fetch(shareUrl, {
    headers: {
      "User-Agent":
        "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    },
    redirect: "manual",
  });

  const location = res.headers.get("location");
  return location || shareUrl;
}

/**
 * Ekstraksi story/post node dari GraphQL Comet Relay tree
 */
function extractPostData(node) {
  if (!node || typeof node !== "object") return null;

  const cs = node.comet_sections;
  if (!cs || typeof cs !== "object") return null;

  // 1. Caption / Pesan teks
  const contentStory = cs.content?.story;
  const caption = contentStory?.message?.text || null;

  // Lewati jika tidak ada caption
  if (!caption) return null;

  // 2. Feedback (Likes, Comments, Shares, Permalink)
  const fbStory = cs.feedback?.story;
  const fbRenderer =
    fbStory?.story_ufi_container?.story?.feedback_context
      ?.feedback_target_with_context
      ?.comet_ufi_summary_and_actions_renderer;
  const fb = fbRenderer?.feedback || {};

  let likes = fb.reaction_count?.count || 0;
  let comments = 0;
  let shares = fb.share_count?.count || 0;

  if (Array.isArray(fb.adaptive_ufi_action_renderers)) {
    for (const item of fb.adaptive_ufi_action_renderers) {
      const fba = item?.feedback;
      if (!fba) continue;
      if (fba.reaction_count?.count !== undefined) {
        likes = fba.reaction_count.count;
      }
      if (fba.share_count?.count !== undefined) {
        shares = fba.share_count.count;
      }
      if (fba.comment_rendering_instance?.comments?.total_count !== undefined) {
        comments = fba.comment_rendering_instance.comments.total_count;
      }
    }
  }

  // 3. Post ID & Permalink URL
  let postId = null;
  const feedbackId = fb.id;
  if (feedbackId) {
    try {
      const decoded = Buffer.from(feedbackId, "base64").toString("utf-8");
      postId = decoded.replace("feedback:", "");
    } catch {
      postId = feedbackId;
    }
  }

  const postUrl =
    fb.url ||
    (postId ? `https://www.facebook.com/permalink.php?story_fbid=${postId}` : null);

  // 4. Gambar / Media attachments
  const images = [];
  if (Array.isArray(node.attachments)) {
    for (const att of node.attachments) {
      const media = att?.styles?.attachment?.media;
      const imgUrl = media?.image?.uri || media?.photo_image?.uri;
      if (imgUrl) {
        images.push(imgUrl);
      }
    }
  }

  // 5. Waktu pembuatan (Date / Timestamp)
  const timestamp = node.creation_time || null;
  const dateIso = timestamp ? new Date(timestamp * 1000).toISOString() : null;

  // 6. Profil author info jika ada di node ini
  let actorInfo = null;
  const actorObj = cs.context_layout?.story?.comet_sections?.actor_photo?.story?.actors?.[0];
  if (actorObj) {
    actorInfo = {
      id: actorObj.id || null,
      name: actorObj.name || null,
      url: actorObj.url || null,
      avatar: actorObj.profile_picture?.uri || null,
    };
  }

  return {
    post_id: postId,
    url: postUrl,
    date: dateIso,
    timestamp: timestamp,
    caption: caption.trim(),
    likes: likes,
    comments: comments,
    shares: shares,
    images: images,
    _actor: actorInfo,
  };
}

/**
 * Scraping Facebook dan menghasilkan format JSON
 */
export async function scrapeFacebookPosts(targetUrl, cookieFile = "cookies.txt") {
  const cookieHeader = parseNetscapeCookies(cookieFile);

  // 1. Resolve shortlink
  let realUrl = targetUrl;
  if (targetUrl.includes("/share/")) {
    realUrl = await resolveShareUrl(targetUrl);
  }

  // 2. Fetch profil desktop dengan cookie
  const response = await fetch(realUrl, {
    headers: {
      Cookie: cookieHeader,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    },
  });

  if (!response.ok) {
    throw new Error(`Gagal fetch profil (${response.status}): ${realUrl}`);
  }

  const html = await response.text();

  // 3. Cari dan parse semua RelayPrefetchedStreamCache JSON scripts
  const scriptRegex = /<script type="application\/json"[^>]*>(.*?)<\/script>/gi;
  const relayDataList = [];
  let sMatch;

  while ((sMatch = scriptRegex.exec(html)) !== null) {
    const raw = sMatch[1];
    if (!raw.includes("RelayPrefetchedStreamCache")) continue;

    try {
      const parsed = JSON.parse(raw);
      const reqs = parsed.require || [];
      for (const r of reqs) {
        if (!Array.isArray(r[3])) continue;
        for (const a of r[3]) {
          const subRequires = a?.__bbox?.require || [];
          for (const sub of subRequires) {
            if (sub[0] === "RelayPrefetchedStreamCache" && Array.isArray(sub[3])) {
              for (const item of sub[3]) {
                const resData = item?.__bbox?.result?.data;
                if (resData) relayDataList.push(resData);
              }
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // 4. Ekstraksi postingan & profil
  const posts = [];
  const seenPostKeys = new Set();
  let authorProfile = null;

  function traverse(obj) {
    if (!obj || typeof obj !== "object") return;
    if (obj.comet_sections) {
      const post = extractPostData(obj);
      if (post && post.caption) {
        if (post._actor && !authorProfile) {
          authorProfile = post._actor;
        }
        delete post._actor;

        const key = post.post_id || post.caption;
        if (!seenPostKeys.has(key)) {
          seenPostKeys.add(key);
          posts.push(post);
        }
      }
    }
    for (const key of Object.keys(obj)) {
      traverse(obj[key]);
    }
  }

  for (const dataNode of relayDataList) {
    traverse(dataNode);
  }

  // Urutkan postingan dari yang terbaru
  posts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  return {
    profile: authorProfile || {
      url: realUrl,
      source_share_url: targetUrl,
    },
    total_posts: posts.length,
    posts: posts,
  };
}

// CLI Execution
const targetUrl =
  process.argv[2] || "https://www.facebook.com/share/1F4S83JSGf/";

scrapeFacebookPosts(targetUrl)
  .then((result) => {
    // Output JSON terformat rapi
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((err) => {
    console.error(JSON.stringify({ error: err.message }, null, 2));
    process.exit(1);
  });
