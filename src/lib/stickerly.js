import axios from 'axios';

class StickerLy {
    constructor() {
        this.headers = {
            'user-agent': 'androidapp.stickerly/3.17.0 (Redmi Note 4; U; Android 29; in-ID; id;)',
            'content-type': 'application/json',
            'accept-encoding': 'gzip',
        };
    }

    async search(query) {
        try {
            if (!query) throw new Error('Query is required');

            const { data } = await axios.post(
                'https://api.sticker.ly/v4/stickerPack/smartSearch',
                {
                    keyword: query,
                    enabledKeywordSearch: true,
                    filter: {
                        extendSearchResult: false,
                        sortBy: 'RECOMMENDED',
                        languages: ['ALL'],
                        minStickerCount: 5,
                        searchBy: 'ALL',
                        stickerType: 'ALL',
                    },
                },
                { headers: this.headers }
            );

            return data.result.stickerPacks.map((pack) => ({
                name: pack.name,
                author: pack.authorName,
                stickerCount: pack.resourceFiles.length,
                viewCount: pack.viewCount,
                exportCount: pack.exportCount,
                isPaid: pack.isPaid,
                isAnimated: pack.isAnimated,
                thumbnailUrl: `${pack.resourceUrlPrefix}${pack.resourceFiles[pack.trayIndex]}`,
                url: pack.shareUrl,
            }));
        } catch (error) {
            throw new Error(error.message);
        }
    }

    async detail(url) {
        try {
            const match = url.match(/\/s\/([^\/\?#]+)/);
            if (!match) throw new Error('Invalid Sticker.ly URL');

            const { data } = await axios.get(
                `https://api.sticker.ly/v4/stickerPack/${match[1]}?needRelation=true`,
                { headers: this.headers }
            );

            const res = data.result;
            return {
                name: res.name,
                author: res.user.displayName,
                stickers: res.stickers.map((stick) => ({
                    fileName: stick.fileName,
                    isAnimated: stick.isAnimated,
                    imageUrl: `${res.resourceUrlPrefix}${stick.fileName}`,
                })),
                thumbnailUrl: `${res.resourceUrlPrefix}${res.stickers[res.trayIndex].fileName}`,
                stickerCount: res.stickers.length,
                url: res.shareUrl,
            };
        } catch (error) {
            throw new Error(error.message);
        }
    }
}

export default new StickerLy();
