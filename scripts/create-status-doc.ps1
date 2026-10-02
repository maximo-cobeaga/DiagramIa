# Genera un resumen ejecutivo editable en Word, sin dependencias externas.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression

$docsDir = (Resolve-Path (Join-Path $PSScriptRoot '..\docs')).Path
$output = Join-Path $docsDir 'Estado_Diagramia_MVP.docx'
$utf8 = [System.Text.UTF8Encoding]::new($false)

function Escape-Xml([string]$value) {
  return [System.Security.SecurityElement]::Escape($value)
}

function New-Paragraph([string]$value, [string]$style = 'Normal') {
  $escaped = Escape-Xml $value
  return '<w:p><w:pPr><w:pStyle w:val="' + $style + '"/></w:pPr><w:r><w:t xml:space="preserve">' + $escaped + '</w:t></w:r></w:p>'
}

function Add-Entry($archive, [string]$name, [string]$content) {
  $entry = $archive.CreateEntry($name, [System.IO.Compression.CompressionLevel]::Optimal)
  $stream = $entry.Open()
  $writer = [System.IO.StreamWriter]::new($stream, $utf8)
  try { $writer.Write($content) } finally { $writer.Dispose() }
}

$paragraphs = @(
  (New-Paragraph 'Diagramia: estado del MVP' 'Title')
  (New-Paragraph 'Resumen simple · 1 de octubre de 2026' 'Subtitle')
  (New-Paragraph 'HOY: existe una versión funcional para probar, pero todavía no está lista para publicarse.' 'Callout')

  (New-Paragraph '¿Qué es?' 'Heading1')
  (New-Paragraph 'Una pizarra para dibujar diagramas, pedir cambios a una IA y convertirlos en explicaciones animadas. Las formas, flechas y pasos siguen siendo editables después de usar la IA.')

  (New-Paragraph 'Lo que ya funciona' 'Heading1')
  (New-Paragraph '• Dibujar y editar nodos, texto, zonas, conexiones, líneas, flechas y trazos a mano. Hay deshacer, varios diagramas y guardado local.')
  (New-Paragraph '• Crear o modificar diagramas con IA. Antes de aplicar un cambio se ve la propuesta; el sistema la valida. Se probó con un modelo local real.')
  (New-Paragraph '• Animar un recorrido por pasos, con textos, resaltados, cámara y caminos alternativos; presentarlo desde la misma app.')
  (New-Paragraph '• Usar cuentas y proyectos privados con versiones y límites iniciales del plan Gratis. Una IA externa puede acceder por MCP con permisos.')
  (New-Paragraph '• Importar varios formatos de diagramas y exportar JSON, imágenes y PDF. Algunas conversiones pierden detalles y lo informan.')

  (New-Paragraph 'Qué falta para lanzar la primera versión' 'Heading1')
  (New-Paragraph '• Almacenar imágenes y otros archivos de forma segura en la nube; completar tareas largas y su recuperación si fallan.')
  (New-Paragraph '• Probar el inicio de sesión con Auth0 real, dos dispositivos y dos aplicaciones externas conectadas por MCP.')
  (New-Paragraph '• Medir el costo real de la IA y cerrar el plan Gratis, Pro, pagos y uso de claves propias. Hoy los cupos son de prueba.')
  (New-Paragraph '• Terminar y revisar accesibilidad, velocidad, seguridad y exportación con movimiento. El PDF actual muestra imágenes fijas.')

  (New-Paragraph 'Decisiones a tomar' 'Heading1')
  (New-Paragraph '1. Lanzamiento: ¿alcanza con animaciones dentro de Diagramia y PDF fijo, o el video exportable es obligatorio? Sugerencia: lanzar con la primera opción y sumar video después.')
  (New-Paragraph '2. IA y precios: elegir el modelo y los límites finales cuando haya mediciones reales. Los 20 créditos al mes y 6 al día son una hipótesis, no una promesa comercial.')
  (New-Paragraph '3. Higgsfield: confirmar acceso y contrato antes de integrarlo. Sugerencia: dejarlo como complemento posterior; el producto principal no depende de él.')

  (New-Paragraph 'Cómo se vería el producto terminado' 'Heading1')
  (New-Paragraph 'Una persona entra y dibuja sin cuenta. Si inicia sesión, guarda en la nube, pide a la IA que cree o cambie sólo una parte del diagrama, revisa el resultado y lo acepta. Luego arma una explicación animada, la presenta y la exporta. Sus archivos se mantienen privados, puede recuperar versiones y conoce sus límites de uso.')

  (New-Paragraph 'Próximo paso' 'Heading1')
  (New-Paragraph 'Construir el almacenamiento de archivos y las tareas durables. Después, conectar servicios reales y hacer una ronda de pruebas de uso y seguridad. El código pasó 88 pruebas automáticas y 33 recorridos de navegador; eso todavía no reemplaza las pruebas de lanzamiento.')
)

$document = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
  ($paragraphs -join '') +
  '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="950" w:bottom="850" w:left="950" w:header="400" w:footer="400" w:gutter="0"/></w:sectPr></w:body></w:document>'

$styles = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="IBM Plex Sans" w:hAnsi="IBM Plex Sans"/><w:sz w:val="20"/><w:color w:val="141619"/></w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="95" w:line="250" w:lineRule="auto"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="40"/></w:pPr><w:rPr><w:rFonts w:ascii="Manrope" w:hAnsi="Manrope"/><w:b/><w:sz w:val="42"/><w:color w:val="245CF6"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="180"/></w:pPr><w:rPr><w:sz w:val="19"/><w:color w:val="606975"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="185" w:after="75"/></w:pPr><w:rPr><w:rFonts w:ascii="Manrope" w:hAnsi="Manrope"/><w:b/><w:sz w:val="24"/><w:color w:val="245CF6"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Callout"><w:name w:val="Callout"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:fill="D4F246"/><w:ind w:left="130" w:right="130"/><w:spacing w:before="75" w:after="125"/></w:pPr><w:rPr><w:b/><w:sz w:val="21"/></w:rPr></w:style>
</w:styles>
'@

$types = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>
'@
$rootRels = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>
'@
$documentRels = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>
'@

$file = [System.IO.File]::Open($output, [System.IO.FileMode]::Create, [System.IO.FileAccess]::ReadWrite)
$zip = [System.IO.Compression.ZipArchive]::new($file, [System.IO.Compression.ZipArchiveMode]::Create, $false)
try {
  Add-Entry $zip '[Content_Types].xml' $types
  Add-Entry $zip '_rels/.rels' $rootRels
  Add-Entry $zip 'word/document.xml' $document
  Add-Entry $zip 'word/styles.xml' $styles
  Add-Entry $zip 'word/_rels/document.xml.rels' $documentRels
} finally { $zip.Dispose() }
Write-Output $output
