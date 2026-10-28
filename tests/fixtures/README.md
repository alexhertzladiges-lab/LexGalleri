# Syntetisk MP4-testfil

`tiny.mp4.b64` er en base64-kodet MP4 med én sort 32×32-pixel H.264 Baseline-videoramme, uden lyd eller personlige optagelser. Den er genereret til integrationstestene. Ingen familiefiler indgår.

Fixturefilen er færdiggenereret; webhotellet og CI behøver ikke FFmpeg. Ved vedligeholdelse kan den genskabes med:

```bash
ffmpeg -v error -f lavfi -i color=c=black:s=32x32:r=1:d=1 -an -c:v libx264 -profile:v baseline -level 3.0 -pix_fmt yuv420p -movflags +faststart -map_metadata -1 -f mp4 tiny.mp4
```
