#!/bin/bash
# kullanım: make_reel.sh sayfa1.jpg sayfa2.jpg muzik.mp3 cikti.mp4
set -e
S1=$1; S2=$2; M=$3; OUT=$4; D1=6.5; D2=8; X=0.6
BG_IMG="$(dirname "$0")/zemin.png"
# her sayfa: lacivert 9:16 zemin + ortada hafif yakınlaşan görsel
for i in 1 2; do
  IMG=$([ $i = 1 ] && echo $S1 || echo $S2); DUR=$([ $i = 1 ] && echo $D1 || echo $D2)
  N=$(python3 -c "print(int($DUR*30))")
  ffmpeg -y -loglevel error -loop 1 -framerate 30 -t $DUR -i "$BG_IMG" -loop 1 -framerate 30 -t $DUR -i "$IMG" -filter_complex \
   "[1:v]scale=2160:-1,zoompan=z='1+0.06*on/$N':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1350:fps=30[im];[0:v][im]overlay=0:285[v]" \
   -map "[v]" -t $DUR -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p p$i.tmp.mp4 && mv p$i.tmp.mp4 p$i.mp4
done
TOT=$(python3 -c "print($D1+$D2-$X)")
ffmpeg -y -loglevel error -i p1.mp4 -i p2.mp4 -i "$M" -filter_complex \
 "[0:v][1:v]xfade=transition=slideleft:duration=$X:offset=$(python3 -c "print($D1-$X)")[v];[2:a]atrim=0:$TOT,afade=t=in:d=0.5,afade=t=out:st=$(python3 -c "print($TOT-1.5)"):d=1.5,volume=0.9[a]" \
 -map "[v]" -map "[a]" -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart $OUT.tmp.mp4 && mv $OUT.tmp.mp4 $OUT
