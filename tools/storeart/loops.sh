#!/bin/sh
# The store page's loops (STORE_PAGE.md, ARCHIVE 15zo), cut from the clips that
# `TRAILER_SET=loops [TRAILER_LANG=de] npm run trailer -w @bollfort/storeart -- record` films into
# trailer-build/loops/<lang>/clips/: each at the game's own speed (a slowed clip sped up again, as
# the trailer's cut does), 616 px wide, with a palette of its own. Valve: under 5 MB an image,
# under 15 MB the images of a description together; each is kept under 4.7 MB, in case 5 MB means
# 5,000,000 bytes.
#
#   sh tools/storeart/loops.sh [clips root] [out dir]
#
# The defaults remake the chosen set in assets/store/description/.
set -eu
ROOT="${1:-trailer-build/loops}"
OUT="${2:-assets/store/description}"
W=616
mkdir -p "$OUT"

# A clip's moment and slowing, from the moments.json its recording wrote.
entry() { tr -d '\n ' < "$1/moments.json" | grep -o "\"$2\":{[^}]*}"; }

report() {
  printf '%-28s %4.2f MB\n' "$(basename "$1")" "$(awk "BEGIN{print $(wc -c < "$1")/1048576}")"
}

# clip LANG CLIP OUT FROM LENGTH FPS COLOURS: LENGTH seconds from FROM seconds after the moment.
clip() {
  clips="$ROOT/$1/clips"
  m=$(entry "$clips" "$2" | sed 's/.*"moment":\([0-9.]*\).*/\1/')
  k=$(entry "$clips" "$2" | grep -o '"slow":[0-9.]*' | cut -d: -f2 || true)
  k=${k:-1}
  start=$(awk "BEGIN{s=$m+($4); if (s<0) s=0; print s}")
  ffmpeg -nostdin -v error -y -i "$clips/$2.mkv" -filter_complex \
    "setpts=$k*PTS,fps=60,trim=start=$start:duration=$5,setpts=PTS-STARTPTS,fps=$6,scale=$W:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=$7:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
    -loop 0 "$OUT/$3.gif"
  report "$OUT/$3.gif"
}

# seamless LANG CLIP OUT START LENGTH FADE FPS COLOURS: LENGTH seconds from START, its last FADE
# seconds crossfaded into its own first frames, so the end runs back into the start (ARCHIVE
# 15zo). The clip is filmed with `&timer=0`: a countdown jumping back would give the seam away.
seamless() {
  film="$ROOT/$1/clips/$2.mkv"
  total=$(awk "BEGIN{print $5+$6}")
  offset=$(awk "BEGIN{print $5-$6}")
  ffmpeg -nostdin -v error -y -i "$film" -filter_complex \
    "[0:v]fps=60,trim=start=$4:duration=$total,setpts=PTS-STARTPTS,fps=$7,scale=$W:-2:flags=lanczos,split[p][q];[p]trim=start=$6,setpts=PTS-STARTPTS[a];[q]trim=duration=$6,setpts=PTS-STARTPTS[b];[a][b]xfade=transition=fade:duration=$6:offset=$offset,split[g][h];[g]palettegen=max_colors=$8:stats_mode=diff[pal];[h][pal]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
    -loop 0 "$OUT/$3.gif"
  report "$OUT/$3.gif"
}

# The user's choice (2026-11-06): one loop for each stage of a round, and the towers.
clip en cannons-chocolate 1-place-cannons -0.3 2.6 20 256
seamless en combat-cartoon-d 2-combat 0.6 4.5 0.6 16 224
clip en seal-sports 3-rebuild -1.5 4.5 20 256
clip en wipe-christmas-halloween 4-change-of-look-en -1.0 3.0 20 256
clip de wipe-christmas-halloween 4-change-of-look-de -1.0 3.0 20 256
clip en tower-frost 5-special-towers 5.5 3.0 12 128
