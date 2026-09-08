# design/ — sources for the raster brand assets

`assets/og-image.png` and `assets/apple-touch-icon.png` are rendered from the
HTML files here, so the share card and the iOS icon never drift from the site's
own tokens. Re-render after any brand change:

    CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

    "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
      --force-device-scale-factor=1 --virtual-time-budget=6000 \
      --window-size=1200,630 --screenshot=../assets/og-image.png \
      "file://$PWD/og-image.html"

    "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
      --force-device-scale-factor=1 --virtual-time-budget=6000 \
      --window-size=180,180 --screenshot=../assets/apple-touch-icon.png \
      "file://$PWD/apple-touch-icon.html"

`--virtual-time-budget` is what waits for the Google Fonts request; drop it and
the Thai text renders in a fallback face.

The egg path is duplicated here rather than imported — these pages have to
render standalone in headless Chrome. If the mark changes in `index.html`,
change it here too.
