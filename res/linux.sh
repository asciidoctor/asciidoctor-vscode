#!/bin/sh

# xclip is required
command -v xclip >/dev/null 2>&1 || { echo >&2 "no xclip"; exit 1; }

if
xclip -selection clipboard -target image/png -o >/dev/null 2>&1
then
xclip -selection clipboard -target image/png -o >$1 2>/dev/null
echo $1
else
echo "no image" >&2
exit 1
fi
