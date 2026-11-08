"""Tira 6 quadros de cada clipe (para escolher o trecho de cada corte). blender -b --python sample_clips.py -- <clips> <saida>"""
import bpy, sys, os, glob

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.resolution_x, sc.render.resolution_y = 320, 180
sc.render.image_settings.file_format = 'JPEG'
sc.view_settings.view_transform = 'Standard'
sc.sequence_editor_create()
for path in sorted(glob.glob(os.path.join(src, '*.mp4'))):
    name = os.path.splitext(os.path.basename(path))[0]
    for s in list(sc.sequence_editor.strips):
        sc.sequence_editor.strips.remove(s)
    st = sc.sequence_editor.strips.new_movie(name, path, 1, 1, fit_method='FIT')
    fps = st.fps if hasattr(st, 'fps') else 25
    n = st.frame_final_duration
    sc.render.fps = round(fps)
    if hasattr(st, 'fit_method'):
        st.fit_method = 'FIT'
    sc.frame_start, sc.frame_end = 1, n
    for k in range(6):
        f = 1 + int((n - 2) * k / 5)
        sc.frame_set(f)
        sc.render.filepath = os.path.join(out, f'{name}__{k}_{f / fps:.1f}s.jpg')
        bpy.ops.render.render(write_still=True)
    print('[amostra]', name, n, 'quadros', round(fps, 2), 'fps', flush=True)
