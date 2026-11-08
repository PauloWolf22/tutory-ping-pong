"""
Vídeo de abertura da home: montagem com clipes reais (Pexels, licença livre) no editor de vídeo do Blender.

  blender -b --factory-startup --python tools/home_video/build_edit.py -- <saida_sem_extensao> [--preview] [--stills] [--save x.blend]

Clipes em tools/home_video/clips (baixados de videos.pexels.com, lista em clips/lista.txt). Saída: MP4 (H.264) e
WebM (VP9) em 1920x1080 (ou 960x540 com --preview) e um JPEG de capa. Tudo em loop: começa e termina no preto.
"""
import bpy, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.abspath(os.path.join(HERE, '..', '..', 'app'))
CLIPS = os.path.join(HERE, 'clips')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.path.join(HERE, 'home')
PREVIEW = '--preview' in argv
FPS = 24

# (arquivo, segundo de entrada no clipe, duração em quadros da edição, legenda)
# Clipes de 60 fps tocam a 24: viram câmera lenta (estádio e chute).
CUTS = [
    ('08_fut_estadio', 0.2, 72, None),
    ('01_jj_faixa_preta', 0.3, 40, 'JIU-JITSU'),
    ('03_jj_luta', 6.0, 38, None),
    ('04_pp_rebate', 2.2, 34, 'PING PONG'),
    ('05_pp_mesa', 2.2, 22, None),
    ('06_fut_chute', 4.1, 38, 'FUTEBOL'),
    ('07_fut_penalti', 4.0, 40, None),
    ('09_tenis_saque', 1.4, 40, 'TÊNIS'),
    ('10_gaming_foco', 1.0, 38, 'TUTORY GAMING'),
    ('11_esports_arena', 1.2, 32, None),
    ('12_gaming_controle', 2.0, 28, None),
    ('14_comemoracao', 2.6, 46, None),
    ('13_trofeu', 7.6, 60, None),
]
LOGO_END = 60  # fechamento: logo sobre preto

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = FPS
RES = int(argv[argv.index('--res') + 1]) if '--res' in argv else (540 if PREVIEW else 1080)
sc.render.resolution_x, sc.render.resolution_y = RES * 16 // 9, RES
sc.render.resolution_percentage = 100
sc.view_settings.view_transform = 'Standard'
ed = sc.sequence_editor_create()
S = ed.strips
font_bold = bpy.data.fonts.load(os.path.join(APP, 'assets', 'fonts', 'Gilroy-ExtraBold.otf'))
font_light = bpy.data.fonts.load(os.path.join(APP, 'assets', 'fonts', 'Gilroy-Light.otf'))


def trim(st, start, length):
    """Deixa só [start, start+length) na edição."""
    for a, b in (('left_handle', 'right_handle'), ('frame_final_start', 'frame_final_end')):
        if hasattr(st, a):
            try:
                setattr(st, a, start)
                setattr(st, b, start + length)
                return
            except Exception:
                continue


def fade(st, prop, frames_values):
    for f, v in frames_values:
        setattr(st, prop, v)
        st.keyframe_insert(prop, frame=f)


def text(name, body, frame, length, size, y, font, channel, color=(1, 1, 1, 1), spacing=0.0):
    t = S.new_effect(name, 'TEXT', channel, frame, length=length)
    t.text = body
    t.font = font
    t.font_size = size * RES / 1080
    t.location = (0.5, y)
    t.anchor_x, t.anchor_y = 'CENTER', 'CENTER'
    t.color = color
    if hasattr(t, 'use_shadow'):
        t.use_shadow = True
        t.shadow_color = (0, 0, 0, 0.55)
    return t


# ---------------------------------------------------------------- cortes
f = 1
for i, (name, src_sec, length, label) in enumerate(CUTS):
    path = os.path.join(CLIPS, name + '.mp4')
    probe = S.new_movie('probe', path, 9, 1, fit_method='FILL')
    fps = probe.fps
    S.remove(probe)
    src_frame = int(round(src_sec * fps))
    st = S.new_movie(name, path, 1 + (i % 2), f - src_frame, fit_method='FILL')
    trim(st, f, length)
    if hasattr(st, 'use_proxy'):
        st.use_proxy = False
    # leve zoom contínuo: dá vida mesmo aos planos parados
    st.transform.scale_x = st.transform.scale_y = st.transform.scale_x
    base = st.transform.scale_x
    st.transform.scale_x = st.transform.scale_y = base
    st.transform.keyframe_insert('scale_x', frame=f)
    st.transform.keyframe_insert('scale_y', frame=f)
    st.transform.scale_x = st.transform.scale_y = base * 1.06
    st.transform.keyframe_insert('scale_x', frame=f + length)
    st.transform.keyframe_insert('scale_y', frame=f + length)
    if label:
        lt = text('rot_' + name, label, f + 4, length - 6, 78, 0.13, font_bold, 7)
        fade(lt, 'blend_alpha', ((f + 4, 0.0), (f + 9, 1.0), (f + length - 7, 1.0), (f + length - 2, 0.0)))
    f += length
END_CUTS = f
END = f + LOGO_END - 1
sc.frame_start, sc.frame_end = 1, END

# ---------------------------------------------------------------- cor única (camada de ajuste): menos saturação, sombras azuladas, mais contraste
adj = S.new_effect('cor', 'ADJUSTMENT', 4, 1, length=END)
adj.color_saturation = 0.82
cb = adj.modifiers.new('balanço', 'COLOR_BALANCE')
cb.color_balance.lift = (0.94, 0.97, 1.08)
cb.color_balance.gamma = (0.97, 0.99, 1.04)
cb.color_balance.gain = (1.02, 1.02, 1.0)
bc = adj.modifiers.new('contraste', 'BRIGHT_CONTRAST')
bc.bright = -4
bc.contrast = 14

# (vinheta removida: a borda ficava dura no editor de vídeo; a correção de cor já unifica os clipes)

# ---------------------------------------------------------------- abertura: logo sobre o estádio, entrando do preto
logo_path = os.path.join(APP, 'assets', 'brand', 'logo-branco.png')
dark = S.new_effect('escurece', 'COLOR', 6, 1, length=72)
dark.color = (0.0, 0.01, 0.03)
dark.blend_type = 'ALPHA_OVER'
fade(dark, 'blend_alpha', ((1, 1.0), (12, 0.55), (58, 0.55), (72, 0.0)))
logo = S.new_image('logo', logo_path, 8, 10, fit_method='FIT')
trim(logo, 10, 58)
logo.blend_type = 'ALPHA_OVER'
logo.transform.scale_x = logo.transform.scale_y = 0.42
logo.transform.offset_y = sc.render.resolution_y * 0.05
fade(logo, 'blend_alpha', ((10, 0.0), (22, 1.0), (56, 1.0), (67, 0.0)))
sp = text('sports_abertura', 'S P O R T S', 18, 50, 64, 0.36, font_light, 9)
fade(sp, 'blend_alpha', ((18, 0.0), (28, 1.0), (56, 1.0), (67, 0.0)))

# ---------------------------------------------------------------- fechamento: preto, logo e chamada; termina no preto (emenda com a abertura)
black = S.new_effect('fim_preto', 'COLOR', 6, END_CUTS - 10, length=LOGO_END + 10)
black.color = (0.0, 0.01, 0.03)
black.blend_type = 'ALPHA_OVER'
fade(black, 'blend_alpha', ((END_CUTS - 10, 0.0), (END_CUTS + 2, 1.0)))
logo2 = S.new_image('logo_fim', logo_path, 8, END_CUTS, fit_method='FIT')
trim(logo2, END_CUTS, LOGO_END - 4)
logo2.blend_type = 'ALPHA_OVER'
logo2.transform.scale_x = logo2.transform.scale_y = 0.36
logo2.transform.offset_y = sc.render.resolution_y * 0.06
fade(logo2, 'blend_alpha', ((END_CUTS, 0.0), (END_CUTS + 10, 1.0), (END - 14, 1.0), (END - 3, 0.0)))
tag = text('chamada', 'A COMUNIDADE ESPORTIVA DA TUTORY', END_CUTS + 8, LOGO_END - 12, 46, 0.35, font_light, 9)
fade(tag, 'blend_alpha', ((END_CUTS + 8, 0.0), (END_CUTS + 18, 1.0), (END - 14, 1.0), (END - 3, 0.0)))

print('[edit] quadros', END, 'duração', round(END / FPS, 1), 's', flush=True)
if '--save' in argv:
    bpy.ops.wm.save_as_mainfile(filepath=argv[argv.index('--save') + 1])

# ---------------------------------------------------------------- saída
if '--stills' in argv:
    sc.render.image_settings.file_format = 'JPEG'
    marks = [12, 40, 90, 130, 165, 200, 240, 280, 318, 350, 390, 440, 500, END - 30]
    for m in marks:
        sc.frame_set(m)
        sc.render.filepath = f'{OUT}_still_{m:04d}.jpg'
        bpy.ops.render.render(write_still=True)
    raise SystemExit
# capa: a logo sobre o estádio
sc.render.image_settings.file_format = 'JPEG'
sc.render.image_settings.quality = 82
sc.frame_set(40)
sc.render.filepath = OUT + '-poster.jpg'
bpy.ops.render.render(write_still=True)
if hasattr(sc.render.image_settings, 'media_type'):
    sc.render.image_settings.media_type = 'VIDEO'
sc.render.image_settings.file_format = 'FFMPEG'
ff = sc.render.ffmpeg
ff.audio_codec = 'NONE'
ff.gopsize = 48
ff.ffmpeg_preset = 'GOOD'
sc.render.use_file_extension = False
for kind, fmt, codec in (('mp4', 'MPEG4', 'H264'), ('webm', 'WEBM', 'WEBM')):
    if kind == 'webm' and '--no-webm' in argv:
        continue
    ff.format, ff.codec = fmt, codec
    ff.constant_rate_factor = argv[argv.index('--crf') + 1] if '--crf' in argv else 'LOW'
    sc.render.filepath = f'{OUT}.{kind}'
    bpy.ops.render.render(animation=True)
    print('[edit]', kind, os.path.getsize(sc.render.filepath), 'bytes', flush=True)
