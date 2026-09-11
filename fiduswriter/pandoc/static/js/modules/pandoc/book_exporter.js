import {BibLatexExporter} from "bibliojson"
import download from "downloadjs"

import {getMissingChapterData} from "../books/exporter/tools"
import {addAlert, get} from "../common"
import {PandocExporterCitations} from "../exporter/pandoc/citations"
import {PandocExporterConvert} from "../exporter/pandoc/convert"
import {fixTables, removeHidden} from "../exporter/tools/doc_content"
import {createSlug} from "../exporter/tools/file"
import {ZipFileCreator} from "../exporter/tools/zip"

/**
 * Exports a book via pandoc-wasm, converting each chapter to a chosen format
 * and packaging all converted files into a single ZIP.
 *
 * ZIP structure:
 *
 *   book.json                          → book metadata + chapter list
 *   chapters/<n>/<slug>.<ext>          → converted chapter file
 *   bibliography.bib                   → combined bibliography (if any)
 *
 * The exporter processes chapters sequentially to keep memory usage bounded.
 */
export class PandocBookExporter {
    constructor(
        schema,
        csl,
        book,
        user,
        docList,
        updated,
        format,
        fileExtension,
        mimeType,
        options = {}
    ) {
        this.schema = schema
        this.csl = csl
        this.book = book
        this.user = user
        this.docList = docList
        this.updated = updated
        this.format = format
        this.fileExtension = fileExtension
        this.mimeType = mimeType
        this.options = options

        this.textFiles = []
        this.httpFiles = []
        this.bibliography = {}
    }

    init() {
        if (this.book.chapters.length === 0) {
            addAlert(
                "error",
                gettext("Book cannot be exported due to lack of chapters.")
            )
            return Promise.resolve(false)
        }

        addAlert(
            "info",
            `${this.book.title}: ${gettext("Pandoc export has been initiated.")}`
        )

        return getMissingChapterData(this.book, this.docList, this.schema)
            .then(() => this.exportContents())
            .catch(error => {
                addAlert(
                    "error",
                    `${this.book.title}: ${gettext("Pandoc export failed.")}`
                )
                throw error
            })
    }

    async exportContents() {
        const {convert} = await import("pandoc-wasm")
        const sortedChapters = [...this.book.chapters].sort(
            (a, b) => a.number - b.number
        )

        // ── book.json metadata ──────────────────────────────────────────────
        const bookData = {
            title: this.book.title,
            metadata: this.book.metadata || {},
            settings: this.book.settings || {},
            chapters: sortedChapters.map((chapter, index) => ({
                number: chapter.number,
                part: chapter.part || "",
                chapter_index: index
            }))
        }
        this.textFiles.push({
            filename: "book.json",
            contents: JSON.stringify(bookData, null, 2)
        })

        // ── Process chapters sequentially ───────────────────────────────────
        for (
            let chapterIndex = 0;
            chapterIndex < sortedChapters.length;
            chapterIndex++
        ) {
            const chapter = sortedChapters[chapterIndex]
            const doc = this.docList.find(d => d.id === chapter.text)
            if (!doc) {
                continue
            }

            const chapterSlug = createSlug(doc.title || gettext("Untitled"))
            const docContent = fixTables(removeHidden(doc.content))
            const imageDB = {db: doc.images}
            const bibDB = {db: doc.bibliography}

            // ── 1. Convert chapter content to Pandoc JSON AST ──────────────
            // Create a minimal exporter mock so PandocExporterConvert &
            // PandocExporterCitations can operate without the full
            // PandocExporter infrastructure from the editor.
            const exporterMock = {
                citations: null,
                doc: {settings: doc.settings || {}}
            }

            const citations = new PandocExporterCitations(
                exporterMock,
                bibDB,
                this.csl,
                docContent
            )

            await citations.init()

            exporterMock.citations = citations

            const converter = new PandocExporterConvert(
                exporterMock,
                imageDB,
                bibDB,
                doc.settings || {}
            )

            const conversion = converter.init(docContent)

            // ── 2. Collect used bibliography entries ────────────────────────
            Object.keys(conversion.usedBibDB).forEach(bibId => {
                this.bibliography[bibId] = doc.bibliography[bibId]
            })

            // ── 3. Queue image downloads ────────────────────────────────────
            conversion.imageIds.forEach(id => {
                const entry = doc.images[id]
                if (entry) {
                    this.httpFiles.push({
                        filename: entry.image.split("/").pop(),
                        url: entry.image
                    })
                }
            })

            // ── 4. Download images for pandoc-wasm ─────────────────────────
            const binaryFiles = conversion.imageIds
                .map(id => {
                    const entry = doc.images[id]
                    if (!entry) {
                        return null
                    }
                    return get(entry.image)
                        .then(response => response.blob())
                        .then(blob => ({
                            filename: entry.image.split("/").pop(),
                            contents: blob
                        }))
                })
                .filter(p => p !== null)

            const downloadedFiles = await Promise.all(binaryFiles)

            const pandocFiles = {}
            downloadedFiles.forEach(f => {
                if (f) {
                    pandocFiles[f.filename] = f.contents
                }
            })

            // ── 5. Add bibliography for this chapter (if any) ──────────────
            const hasBib = Object.keys(conversion.usedBibDB).length > 0
            const chapterBibEntries = {}
            if (hasBib) {
                Object.keys(conversion.usedBibDB).forEach(bibId => {
                    if (doc.bibliography[bibId]) {
                        chapterBibEntries[bibId] = doc.bibliography[bibId]
                    }
                })
            }

            const pandocOptions = {
                from: "json",
                to: this.format,
                standalone: true
            }

            if (hasBib && Object.keys(chapterBibEntries).length > 0) {
                const bibExport = new BibLatexExporter(chapterBibEntries)
                const bibContents = bibExport.parse()
                pandocFiles["bibliography.bib"] = bibContents
                pandocOptions.bibliography = "bibliography.bib"
                pandocOptions.citeproc = true
            }

            // ── 6. Convert via pandoc-wasm ─────────────────────────────────
            const content = JSON.stringify(conversion.json)
            const {stdout: out} = await convert(
                pandocOptions,
                content,
                pandocFiles
            )

            // Add converted file to text files
            const outputFilename = `chapters/${chapterIndex}/${chapterSlug}.${this.fileExtension}`
            this.textFiles.push({
                filename: outputFilename,
                contents: out
            })
        }

        // ── 7. Add combined bibliography at book level (if any) ────────────
        if (Object.keys(this.bibliography).length > 0) {
            const bibExport = new BibLatexExporter(this.bibliography)
            this.textFiles.push({
                filename: "bibliography.bib",
                contents: bibExport.parse()
            })
        }

        // ── 8. Create and download the ZIP ─────────────────────────────────
        return this.createZip()
    }

    createZip() {
        const zipper = new ZipFileCreator(
            this.textFiles,
            this.httpFiles,
            undefined,
            undefined,
            this.updated
        )
        return zipper.init().then(blob => this.download(blob))
    }

    download(blob) {
        const zipName = `${createSlug(this.book.title)}.${this.format}.zip`
        return download(blob, zipName, "application/zip")
    }
}
