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
  (New-Paragraph 'Resumen simple · 3 de octubre de 2026' 'Subtitle')
  (New-Paragraph 'HOY: el producto está listo para lanzarse en cuanto conectes tres servicios externos (OpenAI, Auth0 y el servidor). Nada se publicó todavía.' 'Callout')

  (New-Paragraph '¿Qué es?' 'Heading1')
  (New-Paragraph 'Una pizarra para dibujar diagramas, pedir cambios a una IA y convertirlos en explicaciones animadas. Las formas, flechas y pasos siguen siendo editables después de usar la IA.')

  (New-Paragraph 'Lo que ya funciona' 'Heading1')
  (New-Paragraph '• Editor completo: formas, zonas, conexiones, dibujo libre, animaciones, presentación, importar y exportar (JSON, imágenes, PDF y otros formatos).')
  (New-Paragraph '• IA del plan gratis con GPT-6 Luna, lista para conectar. Cada cuenta sólo usa el modelo de su plan, con créditos, email verificado y un tope de gasto diario y mensual que avisa al 80 %.')
  (New-Paragraph '• Medición propia desde el primer día: embudo de la landing al registro, uso del editor y de la IA, opinión 👍/👎 y un panel del fundador con los 10 indicadores clave.')
  (New-Paragraph '• Privacidad: no se mide el contenido de los diagramas, se respeta «no rastrear», se puede eliminar la cuenta y hay un borrador de aviso de privacidad.')
  (New-Paragraph '• Rápido hasta 500 elementos; seguridad revisada; despliegue en tu servidor preparado y probado, incluida la vuelta atrás.')

  (New-Paragraph 'Lo que necesito de vos (paso a paso en docs/GUIA_PASO_A_PASO.md)' 'Heading1')
  (New-Paragraph '1. Una clave de OpenAI con crédito, para probar Luna de verdad y medir el costo.')
  (New-Paragraph '2. Una cuenta de Auth0, para el inicio de sesión real.')
  (New-Paragraph '3. Dominio y acceso al servidor, y tu autorización para publicar.')
  (New-Paragraph '4. Decisiones tuyas: la licencia del código y la revisión legal del aviso de privacidad.')

  (New-Paragraph 'Después del lanzamiento' 'Heading1')
  (New-Paragraph 'Con datos reales: cobros y plan Pro, un asistente que analice las métricas cada semana, imágenes en la nube, exportar video y conexión con más asistentes de IA externos.')

  (New-Paragraph 'Cómo saber que funciona' 'Heading1')
  (New-Paragraph '102 pruebas automáticas y 34 recorridos en un navegador real, sumados a pruebas con base de datos y con el servidor de producción armado en esta PC. Falta tu revisión a mano: la lista está en VALIDATION.md.')
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
