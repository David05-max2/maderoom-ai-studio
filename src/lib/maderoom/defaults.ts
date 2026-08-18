export const SCENE_NAMES = [
  "01_hook_disenador",
  "02_triangulo_trabajo",
  "03_zonas_funcionales",
  "04_almacenamiento_inteligente",
  "05_materiales_herrajes",
  "06_resultado_final",
] as const;

export const DEFAULT_MASTER_PROMPT = `VIDEO_STYLE = """
Director de fotografía especializado en arquitectura, diseño de interiores y contenido educativo premium.

Animar únicamente la cámara.

Mantener exactamente la misma cocina durante todo el video.

Mantener:

• misma distribución
• misma isla
• mismos gabinetes
• mismos colores
• mismos electrodomésticos
• misma iluminación
• mismo piso
• misma decoración

Mantener completamente estables:

• textos
• iconos
• flechas
• líneas
• zonas resaltadas
• materiales
• objetos educativos

No modificar la cocina.
No agregar personas.
No cambiar materiales.
No deformar muebles.
No modificar textos.
No mover iconos.

Movimientos suaves y cinematográficos.

Duración:
5 segundos.

Formato:
9:16

Video premium para Facebook Reels, Instagram Reels y TikTok.
"""

imagenes = [
{
"name":"01_hook_disenador",
"animation":"""
Slow Push In.
Movimiento muy lento acercándose desde la entrada hacia la isla.
Destacar:
• planos
• muestras
• medidor láser
• tablet
• línea del recorrido
Movimiento elegante.
Duration 5 seconds.
"""
},
{
"name":"02_triangulo_trabajo",
"animation":"""
Slow Tilt Down.
Comenzar ligeramente desde arriba mostrando toda la cocina.
Descender lentamente destacando:
• nevera
• fregadero
• estufa
Las líneas del triángulo permanecen completamente estables.
Duration 5 seconds.
"""
},
{
"name":"03_zonas_funcionales",
"animation":"""
Slow Push In.
Movimiento lento acercándose al centro de la cocina.
Destacar las cuatro zonas de trabajo.
Las líneas de colores permanecen completamente estables.
Duration 5 seconds.
"""
},
{
"name":"04_almacenamiento_inteligente",
"animation":"""
Slow Dolly Right.
Movimiento lateral recorriendo los gabinetes abiertos.
Destacar:
• cajones
• cubiertos
• ollas
• despensa
• organizadores
Movimiento muy suave.
Duration 5 seconds.
"""
},
{
"name":"05_materiales_herrajes",
"animation":"""
Slow Push In.
Movimiento lento acercándose al mesón donde están las muestras.
Destacar:
• melamina
• bisagras
• correderas
• perfiles
• mesón
Mantener completamente estable el texto.
Duration 5 seconds.
"""
},
{
"name":"06_resultado_final",
"animation":"""
Slow Pull Back.
Movimiento lento alejándose para mostrar toda la cocina terminada.
Destacar:
• circulación
• iluminación
• materiales
• isla
• distribución
Mantener completamente estable:
• logo
• textos
• verificaciones
Movimiento elegante de cierre.
Duration 5 seconds.
"""
}
]`;

export const DEFAULT_VOICE_SCRIPT = `Así es como piensa un diseñador profesional antes de crear una cocina.
---
Primero organizamos el triángulo de trabajo entre la nevera, el fregadero y la estufa.
---
Después dividimos la cocina por zonas para que cada espacio tenga una función.
---
También diseñamos el almacenamiento para que todo quede justo donde lo necesitas.
---
Solo cuando todo funciona correctamente elegimos materiales resistentes y herrajes de calidad.
---
En Maderoom diseñamos cocinas inteligentes, funcionales y completamente hechas a tu medida.`;
