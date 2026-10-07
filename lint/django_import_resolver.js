const path = require("path")
const fs = require("fs")
const acorn = require("acorn")
const {execSync} = require("child_process")

// Packages provided by Fidus Writer core base apps. Plugins may import these
// without re-declaring them in their own package.json5 files.
const BASE_PACKAGES = new Set([
    "fwtoolkit",
    "downloadjs",
    "bibliojson",
    "cropperjs",
    "browserslist-useragent-regexp",
    "file-loader",
    "diff-dom",
    "@fortawesome/fontawesome-free",
    "simple-datatables",
    "@vivliostyle/print",
    "w3c-keyname",
    "source-map-loader",
    "stacktrace-js",
    "regenerator-runtime",
    "@aaroon/workbox-rspack-plugin",
    "qrcode",
    "tokenfield",
    "fix-utf8",
    "@lcdp/offline-plugin",
    "prosemirror-changeset",
    "prosemirror-collab",
    "prosemirror-commands",
    "prosemirror-dropcursor",
    "prosemirror-example-setup",
    "prosemirror-gapcursor",
    "prosemirror-history",
    "prosemirror-keymap",
    "prosemirror-menu",
    "prosemirror-model",
    "prosemirror-schema-basic",
    "prosemirror-schema-list",
    "prosemirror-state",
    "prosemirror-tables",
    "prosemirror-transform",
    "prosemirror-view",
    "prosemirror-suggestions"
])

// Common Fidus Writer app names. Used to identify cross-app imports when the
// target plugin is not installed in a standalone pre-commit run.
const KNOWN_FIDUSWRITER_APPS = new Set([
    "base",
    "bibliography",
    "book",
    "browser_check",
    "document",
    "feedback",
    "fixturemedia",
    "menu",
    "user",
    "user_template_manager",
    "usermedia",
    "citation_api_import",
    "gitrepo_export",
    "languagetool",
    "llm",
    "ojs",
    "pandoc",
    "payment",
    "phplist",
    "rust",
    "tum",
    "website"
])

function isKnownAppName(name) {
    return KNOWN_FIDUSWRITER_APPS.has(name)
}

function getPackageName(source) {
    if (source.startsWith("@")) {
        const parts = source.split("/")
        return `${parts[0]}/${parts[1]}`
    }
    return source.split("/")[0]
}

function extractJson5Deps(content) {
    const deps = []
    const depBlocks = [
        /dependencies\s*:\s*\{([^}]*)\}/,
        /peerDependencies\s*:\s*\{([^}]*)\}/
    ]
    depBlocks.forEach(pattern => {
        const match = content.match(pattern)
        if (match) {
            const block = match[1]
            const keyRegex = /(?:^|,)\s*["']?([A-Za-z0-9@_\-/.]+)["']?\s*:/g
            let keyMatch
            while ((keyMatch = keyRegex.exec(block)) !== null) {
                deps.push(keyMatch[1])
            }
        }
    })
    return deps
}

function loadPackageDeps(packageFile) {
    try {
        const output = execSync(
            `python -c "from npm_mjs.json5_parser import load_json5; import json; data=load_json5('${packageFile}'); print(json.dumps(list(data.get('dependencies',{}).keys()) + list(data.get('peerDependencies',{}).keys())))"`,
            {encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"]}
        )
        return JSON.parse(output.trim())
    } catch {
        // Pre-commit environments may not have npm_mjs installed; fall back
        // to a simple regex-based parser for package.json5 files.
        try {
            const content = fs.readFileSync(packageFile, "utf-8")
            return extractJson5Deps(content)
        } catch {
            return []
        }
    }
}

function collectAllowedPackages(appsPaths) {
    const allowed = new Set(BASE_PACKAGES)
    appsPaths.forEach(appPath => {
        for (const fileName of ["package.json5", "package.json"]) {
            const packageFile = path.join(appPath, fileName)
            if (isFile(packageFile)) {
                loadPackageDeps(packageFile).forEach(dep => allowed.add(dep))
                break
            }
        }
    })
    return allowed
}

function getFidusWriterPath() {
    try {
        // Get all paths from fiduswriter.__path__ (handles namespace packages and editable installs)
        const pathsOutput = execSync(
            'python -c "import fiduswriter; import json; print(json.dumps([str(p) for p in fiduswriter.__path__]))"'
        )
            .toString()
            .trim()

        const paths = JSON.parse(pathsOutput)

        // Get the current plugin directory to exclude it
        const pluginDir = path.resolve(__dirname, "..")

        // Find the first path that looks like fiduswriter core
        // (not the plugin, and has typical fiduswriter apps like 'document')
        for (const testPath of paths) {
            const resolvedPath = fs.realpathSync(testPath)

            // Skip if this is the plugin directory
            if (
                resolvedPath === pluginDir ||
                resolvedPath.startsWith(pluginDir)
            ) {
                continue
            }

            // Check if this looks like fiduswriter core (has document app)
            if (
                fs.existsSync(path.join(resolvedPath, "document")) ||
                fs.existsSync(path.join(resolvedPath, "bibliography"))
            ) {
                return resolvedPath
            }
        }

        // Fallback: try to find fiduswriter core by looking in parent directories
        // Assumes fiduswriter and fiduswriter-pandoc-plugin are sibling directories
        const pluginParent = path.resolve(pluginDir, "..")
        const fiduswriterCore = path.join(
            pluginParent,
            "fiduswriter",
            "fiduswriter"
        )
        if (
            fs.existsSync(fiduswriterCore) &&
            fs.statSync(fiduswriterCore).isDirectory()
        ) {
            return fiduswriterCore
        }

        // New repository layout: the Django sources live in their own
        // fiduswriter-server-backend repository checked out as a sibling.
        const backendCore = path.join(
            pluginParent,
            "fiduswriter-server-backend",
            "fiduswriter"
        )
        if (
            fs.existsSync(backendCore) &&
            fs.statSync(backendCore).isDirectory()
        ) {
            return backendCore
        }

        throw new Error("Fidus Writer core not found")
    } catch (error) {
        console.error(
            "Failed to find Fidus Writer installation:",
            error.message
        )
        process.exit(1)
    }
}

function isFile(file) {
    let stat
    try {
        stat = fs.statSync(file)
    } catch (e) {
        if (e && (e.code === "ENOENT" || e.code === "ENOTDIR")) {
            return false
        }
        throw e
    }
    return stat.isFile() || stat.isFIFO()
}

function getAppsPaths(rootDir) {
    const appsPaths = []
    const subdirs = fs.readdirSync(rootDir, {withFileTypes: true})
    subdirs.forEach(subdir => {
        if (subdir.isDirectory()) {
            const staticPath = path.join(rootDir, subdir.name, "static")
            if (
                fs.existsSync(staticPath) &&
                fs.lstatSync(staticPath).isDirectory()
            ) {
                appsPaths.push(path.join(rootDir, subdir.name))
            }
        }
    })
    return appsPaths
}

function resolveFilelocation(source, file, appsPaths) {
    const returnValue = {found: false, path: null, crossApp: false}
    const resolvedFile = path.resolve(file)
    const fullPath = path.resolve(path.dirname(resolvedFile), source)

    if (fullPath.includes("/plugins/")) {
        returnValue.found = true
        returnValue.path = null
        return returnValue
    }

    const pluginAppsPaths = appsPaths.filter(appPath =>
        resolvedFile.startsWith(appPath + path.sep)
    )
    const sourceApp = pluginAppsPaths[0]
    const sourceSegments = source
        .split("/")
        .filter(segment => segment && segment !== "." && segment !== "..")
    const targetAppName = sourceSegments[0]

    // Cross-app imports are resolved at runtime by django-npm-mjs when all
    // plugins are installed together, so we cannot verify them in a standalone
    // plugin pre-commit run. We detect them when the target name is a known
    // Fidus Writer app that differs from the source app.
    if (
        sourceApp &&
        targetAppName &&
        targetAppName !== path.basename(sourceApp) &&
        isKnownAppName(targetAppName)
    ) {
        returnValue.found = true
        returnValue.path = null
        returnValue.crossApp = true
        return returnValue
    }

    // Check in plugin and fidus writer apps
    appsPaths.find(appPath => {
        const resolvedPath = fullPath.replace(
            /.*\/static\/js\//g,
            `${appPath}/static/js/`
        )
        if (isFile(`${resolvedPath}.js`)) {
            returnValue.path = `${resolvedPath}.js`
            returnValue.found = true
            return true
        }
        if (isFile(`${resolvedPath}/index.js`)) {
            returnValue.path = `${resolvedPath}/index.js`
            returnValue.found = true
            return true
        }

        return false
    })

    return returnValue
}

function checkExports(filePath, importedNames, sourcePath) {
    const content = fs.readFileSync(filePath, "utf-8")
    const ast = acorn.parse(content, {
        sourceType: "module",
        ecmaVersion: "latest"
    })

    const exportedNames = new Set()

    ast.body.forEach(node => {
        if (node.type === "ExportNamedDeclaration") {
            if (node.declaration) {
                if (node.declaration.id) {
                    exportedNames.add(node.declaration.id.name)
                } else if (node.declaration.declarations) {
                    node.declaration.declarations.forEach(decl => {
                        if (decl.id && decl.id.name) {
                            exportedNames.add(decl.id.name)
                        }
                    })
                }
            }
            if (node.specifiers) {
                node.specifiers.forEach(spec => {
                    exportedNames.add(spec.exported.name)
                })
            }
        } else if (node.type === "ExportDefaultDeclaration") {
            exportedNames.add("default")
        }
    })

    importedNames.forEach(name => {
        if (!exportedNames.has(name)) {
            console.error(
                `Unresolved export: ${name} not found in ${filePath}, imported in ${sourcePath}`
            )
            process.exit(1)
        }
    })
}

function checkImports(file, appsPaths, allowedPackages) {
    const content = fs.readFileSync(file, "utf-8")
    const importRegex =
        /import\s+(?:(\*\s+as\s+\w+)|(\w+)|(\{[^}]+\}))\s+from\s+['"](.*)['"]/g
    let match
    while ((match = importRegex.exec(content)) !== null) {
        const source = match[4]
        // Non-relative imports are allowed if they come from the plugin's own
        // declared dependencies or from Fidus Writer core base packages.
        if (!source.startsWith(".") && !source.startsWith("..")) {
            const packageName = getPackageName(source)
            if (!allowedPackages.has(packageName)) {
                console.error(`Unresolved import: ${source} in file ${file}`)
                process.exit(1)
            }
            continue
        }
        const result = resolveFilelocation(source, file, appsPaths)
        if (!result.found) {
            console.error(`Unresolved import: ${source} in file ${file}`)
            process.exit(1)
        }

        const importedNames = []
        if (match[1]) {
            // import * as name
            importedNames.push("*")
        } else if (match[2]) {
            // import name
            importedNames.push("default")
        } else if (match[3]) {
            // import { name1, name2 }
            const names = match[3]
                .replace(/[{}]/g, "")
                .split(",")
                .map(name => name.trim())
            importedNames.push(...names)
        }
        if (!result.path) {
            // Plugin - final path cannot be checked yet.
            return
        }
        checkExports(result.path, importedNames, file)
    }
}

const pluginPath = path.resolve(__dirname, "../fiduswriter")
const pluginAppsPaths = getAppsPaths(pluginPath)

const fidusWriterPath = getFidusWriterPath()
const fidusWriterAppsPaths = getAppsPaths(fidusWriterPath)

// The book app ships with Fidus Writer core, so it is already covered by
// fidusWriterAppsPaths above.
const appsPaths = pluginAppsPaths.concat(fidusWriterAppsPaths)

const allowedPackages = collectAllowedPackages(appsPaths)

const files = process.argv.slice(2)
files.forEach(file => checkImports(file, appsPaths, allowedPackages))
