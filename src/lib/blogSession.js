import NodeCache from 'node-cache';

// Cache sessions for 30 minutes
const blogCache = new NodeCache({ stdTTL: 1800 });

export const setBlogSession = (userId, posts) => {
    const sessionData = posts.map((post) => ({
        id: post._id,
        slug: post.slug,
        title: post.title,
    }));
    blogCache.set(userId, sessionData);
};

export const getBlogFromSession = (userId, index) => {
    const sessionData = blogCache.get(userId);
    if (!sessionData) return null;

    const idx = parseInt(index) - 1;
    if (isNaN(idx) || idx < 0 || idx >= sessionData.length) return null;

    return sessionData[idx];
};
