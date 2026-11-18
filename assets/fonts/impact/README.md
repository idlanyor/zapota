`src/lib/memeRenderer.js` (.smeme) draws captions with Impact from this folder.

Impact is part of Microsoft's TrueType Core Fonts, whose license allows
redistribution only as the original installer, so `Impact.TTF` is not in the
repository (it is git-ignored). To install it on a server:

1. Download `impact32.exe` from
   https://sourceforge.net/projects/corefonts/files/the%20fonts/final/impact32.exe/download
2. Extract it without running it: `cabextract impact32.exe` (or `7z x impact32.exe`)
3. Copy `Impact.TTF` here.

Without the file, captions fall back to a bold system font.
