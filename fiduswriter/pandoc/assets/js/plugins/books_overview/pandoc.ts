import {getMissingChapterData} from "@fiduswriter/books/exporter/tools"
import {PandocBookExporter} from "@fiduswriter/pandoc/book_exporter"
import {addProgress, gettext, interpolate} from "fwtoolkit"
import {createChapterLoader} from "../../modules/books/adapters/chapter-loader"
import {e2eeStrategy} from "../../modules/books/adapters/e2ee-strategy"

/**
 * Pandoc plugin for the books overview.
 *
 * When the pandoc plugin is installed and activated alongside the books plugin,
 * this adds pandoc-based export items to both the book edit dialog's export
 * dropdown (type: "action") and the books overview's bulk action menu.
 *
 * Each format is added as a separate menu item with " (via Pandoc)" appended
 * to the title so it can coexist alongside the corresponding native exporter.
 *
 * The exporter converts every chapter individually and packages the result
 * into a ZIP archive.
 *
 * If the pandoc plugin is NOT installed, no plugin file exists under
 * plugins/books_overview/, so the books overview remains unmodified.
 */
export class BooksPandoc {
    constructor(overview) {
        this.overview = overview
    }

    init() {
        this.addBulkMenuEntries()
        this.addExportDialogEntries()
    }

    /**
     * Format definitions.
     *
     * Each entry: [label, pandocFormat, fileExtension, mimeType]
     */
    static get FORMATS() {
        return [
            ["Markdown", "markdown", "md", "text/markdown"],
            ["Commonmark", "commonmark", "md", "text/markdown"],
            ["reStructuredText", "rst", "rst", "text/x-rst"],
            ["LaTeX", "latex", "tex", "application/x-latex"],
            ["DocBook", "docbook", "dbk", "application/xml"],
            ["JATS XML", "jats", "xml", "application/xml"],
            ["TEI Simple", "tei", "xml", "application/xml"],
            ["Emacs Org Mode", "org", "org", "text/x-org"],
            ["Textile", "textile", "textile", "text/textile"],
            ["Typst", "typst", "typ", "application/octet-stream"],
            ["Richtext (RTF)", "rtf", "rtf", "application/rtf"],
            ["ICML (Indesign)", "icml", "icml", "application/octet-stream"]
        ]
    }

    /**
     * Helper: start a PandocBookExporter for the given parameters.
     */
    static exportBook(book, overview, format, ext, mime) {
        const task = addProgress(
            "info",
            `${book.title}: ${gettext("Exporting via Pandoc...")}`,
            {autoClose: 6000}
        )
        const progressCallback = (message, percentage) =>
            task.update(percentage, message)
        return getMissingChapterData(
            book,
            overview.documentList,
            overview.schema,
            {
                loader: createChapterLoader(overview.app),
                e2ee: e2eeStrategy,
                progressCallback
            }
        )
            .then(() => {
                const exporter = new PandocBookExporter(
                    overview.schema,
                    overview.app.csl,
                    book,
                    overview.user,
                    overview.documentList,
                    new Date(book.updated * 1000),
                    format,
                    ext,
                    mime,
                    {},
                    progressCallback
                )
                return exporter.init()
            })
            .catch(error => {
                task.close()
                throw error
            })
    }

    /**
     * Add individual "Export selected as … (via Pandoc)" items to the
     * bulk action menu.
     */
    addBulkMenuEntries() {
        const bulkContent = this.overview.dtBulkModel.content

        BooksPandoc.FORMATS.forEach(([label, format, ext, mime]) => {
            bulkContent.push({
                title: interpolate(
                    gettext("Export selected as %s (via Pandoc)"),
                    [label]
                ),
                tooltip: interpolate(
                    gettext("Export selected books as %s using Pandoc."),
                    [label]
                ),
                action: overview => {
                    const ids = overview.getSelected()
                    ids.forEach(id => {
                        const book = overview.bookList.find(b => b.id === id)
                        if (book) {
                            BooksPandoc.exportBook(
                                book,
                                overview,
                                format,
                                ext,
                                mime
                            )
                        }
                    })
                },
                disabled: overview => !overview.getSelected().length
            })
        })
    }

    /**
     * Add individual "Export as … (via Pandoc)" items to the book edit
     * dialog's export dropdown.
     */
    addExportDialogEntries() {
        const exportContent = this.overview.mod.actions.exportMenu.content

        BooksPandoc.FORMATS.forEach(([label, format, ext, mime]) => {
            exportContent.push({
                type: "action",
                title: interpolate(gettext("Export as %s (via Pandoc)"), [
                    label
                ]),
                tooltip: interpolate(
                    gettext("Export book as %s using Pandoc."),
                    [label]
                ),
                action: ({saveBook, book, overview}) => {
                    saveBook().then(() =>
                        BooksPandoc.exportBook(
                            book,
                            overview,
                            format,
                            ext,
                            mime
                        )
                    )
                }
            })
        })
    }
}
