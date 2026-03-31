import { PDFArray, PDFDict, PDFDocument, PDFName, PDFObject, PDFRawStream, PDFRef } from 'pdf-lib'

// pdf-lib stores catalog entries as indirect PDFRefs, not inline dicts.
// The typed .lookup(key, PDFDict) throws on refs — use .get() + manual deref instead.
const deref = (pdfDoc: PDFDocument, obj: PDFObject | undefined): PDFObject | undefined => {
  if (obj instanceof PDFRef) return pdfDoc.context.lookup(obj) ?? undefined
  return obj ?? undefined
}

const buildXmpMetadata = (date: Date): string => {
  const iso = date.toISOString()
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:format>application/pdf</dc:format>
    </rdf:Description>
    <rdf:Description rdf:about=""
        xmlns:xmp="http://ns.adobe.com/xap/1.0/">
      <xmp:CreateDate>${iso}</xmp:CreateDate>
      <xmp:ModifyDate>${iso}</xmp:ModifyDate>
      <xmp:MetadataDate>${iso}</xmp:MetadataDate>
    </rdf:Description>
    <rdf:Description rdf:about=""
        xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"
        xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"
        xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
      <pdfaExtension:schemas>
        <rdf:Bag>
          <rdf:li rdf:parseType="Resource">
            <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
            <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>fx</pdfaSchema:prefix>
            <pdfaSchema:property>
              <rdf:Seq>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>DocumentFileName</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>The name of the embedded XML document</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>DocumentType</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>The type of the hybrid document in capitals</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>Version</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>The actual version of the standard applying to the embedded XML document</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>ConformanceLevel</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>The conformance level of the embedded XML document</pdfaProperty:description>
                </rdf:li>
              </rdf:Seq>
            </pdfaSchema:property>
          </rdf:li>
        </rdf:Bag>
      </pdfaExtension:schemas>
    </rdf:Description>
    <rdf:Description rdf:about=""
        xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
      <fx:DocumentType>INVOICE</fx:DocumentType>
      <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
      <fx:Version>1.0</fx:Version>
      <fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`
}

export const assembleFacturXPdf = async (pdfBytes: Uint8Array, xmlText: string): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const xmlBytes = new TextEncoder().encode(xmlText)
  const now = new Date()

  // 1. Attach the XML — pdf-lib creates the EmbeddedFiles name tree and FileSpec dict
  await pdfDoc.attach(xmlBytes, 'factur-x.xml', {
    mimeType: 'text/xml',
    description: 'Factur-X Invoice',
    creationDate: now,
    modificationDate: now,
  })

  // 2. Add AFRelationship=/Data on the FileSpec (distinguishes an "associated file" from a plain attachment)
  const catalog = pdfDoc.catalog
  const namesDict  = deref(pdfDoc, catalog.get(PDFName.of('Names'))) as PDFDict | undefined
  const efDict     = deref(pdfDoc, namesDict?.get(PDFName.of('EmbeddedFiles'))) as PDFDict | undefined
  const namesArray = deref(pdfDoc, efDict?.get(PDFName.of('Names'))) as PDFArray | undefined

  let fileSpecRef: PDFRef | undefined
  if (namesArray && namesArray.size() >= 2) {
    const candidate = namesArray.get(1)
    if (candidate instanceof PDFRef) {
      fileSpecRef = candidate
      const fileSpec = deref(pdfDoc, fileSpecRef) as PDFDict | undefined
      fileSpec?.set(PDFName.of('AFRelationship'), PDFName.of('Data'))
    }
  }

  // 3. Add AF array in the catalog (required by PDF/A-3)
  if (fileSpecRef) {
    catalog.set(PDFName.of('AF'), pdfDoc.context.obj([fileSpecRef]))
  }

  // 4. Inject XMP metadata stream declaring PDF/A-3b + Factur-X EN 16931 extension schema
  const xmpBytes = new TextEncoder().encode(buildXmpMetadata(now))
  const streamDict = pdfDoc.context.obj({
    Type: PDFName.of('Metadata'),
    Subtype: PDFName.of('XML'),
    Length: xmpBytes.length,
  }) as PDFDict
  const metadataStream = PDFRawStream.of(streamDict, xmpBytes)
  catalog.set(PDFName.of('Metadata'), pdfDoc.context.register(metadataStream))

  // useObjectStreams:false — cross-reference streams are incompatible with PDF/A validators
  return pdfDoc.save({ useObjectStreams: false })
}
