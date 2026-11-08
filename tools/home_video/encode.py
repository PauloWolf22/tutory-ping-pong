"""
Junta os quadros PNG num vídeo (MP4 H.264 e/ou WebM VP9) usando o FFmpeg embutido no Blender.

  blender -b --factory-startup --python tools/home_video/encode.py -- <pasta_quadros> <saida_sem_extensao> [mp4] [webm] [--crf N] [--scale 0.5]
"""
import bpy, sys, os, glob

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
kinds = [k for k in ('mp4', 'webm') if k in argv] or ['mp4', 'webm']
crf = argv[argv.index('--crf') + 1] if '--crf' in argv else 'MEDIUM'
scale = float(argv[argv.index('--scale') + 1]) if '--scale' in argv else 1.0
frames = sorted(glob.glob(os.path.join(src, 'f_*.png')))
if not frames:
    raise SystemExit('nenhum quadro em ' + src)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = 24
img = bpy.data.images.load(frames[0])
w, h = img.size
sc.render.resolution_x, sc.render.resolution_y = int(w * scale) // 2 * 2, int(h * scale) // 2 * 2
sc.render.resolution_percentage = 100
sc.sequence_editor_create()
strip = sc.sequence_editor.strips.new_image('quadros', frames[0], 1, 1)
for f in frames[1:]:
    strip.elements.append(os.path.basename(f))
sc.frame_start, sc.frame_end = 1, len(frames)
sc.view_settings.view_transform = 'Standard'
if hasattr(sc.render.image_settings, 'media_type'):
    sc.render.image_settings.media_type = 'VIDEO'  # Blender 5: vídeo é um tipo de mídia à parte
sc.render.image_settings.file_format = 'FFMPEG'
ff = sc.render.ffmpeg
ff.audio_codec = 'NONE'
ff.gopsize = 24
for kind in kinds:
    if kind == 'mp4':
        ff.format, ff.codec = 'MPEG4', 'H264'
    else:
        ff.format, ff.codec = 'WEBM', 'WEBM'
    try:
        ff.constant_rate_factor = crf
    except TypeError:
        ff.constant_rate_factor = 'MEDIUM'
    ff.ffmpeg_preset = 'GOOD'
    sc.render.filepath = out + '.' + kind
    sc.render.use_file_extension = False
    bpy.ops.render.render(animation=True)
    print('[encode]', kind, os.path.getsize(sc.render.filepath), 'bytes', flush=True)
