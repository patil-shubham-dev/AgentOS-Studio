import { createFile as fsCreateFile, loadFileTree } from "@/lib/filesystem"
import { useWorkspaceStore } from "@/stores/workspace-store"

export const FILE_CREATION_PATTERNS = [
  /make\s+(?:a\s+|an\s+|)(\w+)\s+(?:file|page|website|site)?(?:.*?)(?:saying|called|named|titled|with content|containing)\s+["']?(.+?)["']?$/is,
  /(?:make|create|build|write|generate)\s+(?:a\s+|an\s+|)(\w+)\s+(?:file|page|website|site)/i,
  /(?:make|create|build)\s+(?:a\s+|an\s+|one\s+|)(good.?looking|beautiful|nice|pretty|cool|awesome|simple|basic|)(\w+)(?:\s+and\s+(\w+))?(?:\s+(?:website|site|page|file))?(?:.*?)(?:saying|called|named|titled|with|containing)\s+["']?(.+?)["']?$/is,
]

function detectTemplateType(type: string): { lang: string; extension: string; template: string } | null {
  const t = type.toLowerCase()
  if (t === "html" || t === "website" || t === "site" || t === "webpage" || t === "page") {
    return { lang: "html", extension: ".html", template: "" }
  }
  if (t === "css" || t === "stylesheet") return { lang: "css", extension: ".css", template: "" }
  if (t === "js" || t === "javascript" || t === "script") return { lang: "js", extension: ".js", template: "" }
  if (t === "ts" || t === "typescript") return { lang: "ts", extension: ".ts", template: "" }
  if (t === "html+css" || t === "html & css" || t === "html and css") return { lang: "html", extension: ".html", template: "" }
  return null
}

function generateFileContent(type: string, userSays?: string, secondaryType?: string): string {
  const t = type.toLowerCase()

  if (t === "html" || t === "website" || t === "site" || t === "webpage" || t === "page") {
    const bodyContent = userSays || "Hello World"
    const extraStyles = secondaryType === "css" ? `\n    <link rel="stylesheet" href="styles.css">` : ""
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${bodyContent}</title>${extraStyles}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      background: rgba(255, 255, 255, 0.95);
      border-radius: 16px;
      padding: 48px 64px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      text-align: center;
    }
    h1 {
      font-size: 3.5rem;
      color: #333;
      margin-bottom: 16px;
    }
    p {
      font-size: 1.1rem;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${bodyContent}</h1>
    <p>Welcome to your new website</p>
  </div>
</body>
</html>`
  }

  if (t === "css" || t === "stylesheet") {
    return `* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.container {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 16px;
  padding: 48px 64px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  text-align: center;
}

h1 {
  font-size: 3.5rem;
  color: #333;
  margin-bottom: 16px;
}

p {
  font-size: 1.1rem;
  color: #666;
}`
  }

  if (t === "js" || t === "javascript") {
    return `// ${userSays || "Hello World"}
console.log("${userSays || "Hello World"}")

document.addEventListener("DOMContentLoaded", () => {
  const app = document.getElementById("app")
  if (app) {
    app.textContent = "${userSays || "Hello World"}"
  }
})`
  }

  if (t === "ts" || t === "typescript") {
    return `// ${userSays || "Hello World"}
const greeting: string = "${userSays || "Hello World"}"
console.log(greeting)

export { greeting }`
  }

  return userSays || "Hello World"
}

export function isFileCreationRequest(input: string): boolean {
  return FILE_CREATION_PATTERNS.some(p => p.test(input))
}

export async function executeFileCreation(
  input: string,
  rootPath: string,
  _executionId: string,
  _stepId: string,
): Promise<{ filesCreated: number; message: string } | null> {
  const files: { name: string; content: string }[] = []
  let userSays: string | undefined
  let secondaryType: string | undefined

  for (const pattern of FILE_CREATION_PATTERNS) {
    const match = input.match(pattern)
    if (!match) continue

    const groups = match.filter(g => g !== undefined).slice(1)
    const type1 = groups[0]
    secondaryType = groups[1]
    userSays = groups[groups.length - 1]

    const cleanType1 = type1?.replace(/-?looking/i, "").trim()
    const template = detectTemplateType(cleanType1 || "html")

    if (template) {
      const content = generateFileContent(cleanType1 || "html", userSays, secondaryType)
      const fileName = `index${template.extension}`
      files.push({ name: fileName, content })

      if (secondaryType) {
        const secTemplate = detectTemplateType(secondaryType)
        if (secTemplate) {
          const secContent = generateFileContent(secondaryType)
          files.push({ name: `styles${secTemplate.extension}`, content: secContent })
        }
      }
    } else {
      const fileName = `${cleanType1 || "file"}.txt`
      files.push({ name: fileName, content: userSays || "" })
    }
    break
  }

  if (files.length === 0) return null

  let created = 0
  const errors: string[] = []

  for (const file of files) {
    const fullPath = rootPath.replace(/\\/g, "/") + "/" + file.name
    try {
      await fsCreateFile(fullPath, file.content)
      created++
    } catch (err) {
      errors.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  try {
    const tree = await loadFileTree(rootPath)
    useWorkspaceStore.getState().setFileTree(tree)
  } catch { /* best effort */ }

  const fileMsg = files.map(f => f.name).join(", ")
  if (created > 0) {
    return {
      filesCreated: created,
      message: `Created ${fileMsg}${errors.length > 0 ? `\nWarnings: ${errors.join(", ")}` : ""}`,
    }
  }

  return null
}
