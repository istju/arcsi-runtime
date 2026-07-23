import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// 1. MCP Szerver deklaráció a V4-es identitás alapján
const server = new Server(
  { name: "arcsi-runtime-mcp-gateway", version: "4.0.0" },
  { capabilities: { tools: {}, resources: {} } }
);

const RUNTIME_URL = "http://127.0.0.1:3000";

// Segédfüggvény a friss V4 Manifest lekéréséhez
async function getManifest() {
  const res = await fetch(`${RUNTIME_URL}/capabilities`);
  return await res.json();
}

// 2. TULAJDONSÁGOK ÉS TOOLOOK KILISTÁZÁSA (Dinamikusan az authority alapján)
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const manifest = await getManifest();
  const allowedTools = manifest.authority.boundaries.tool_scope;

  // Leképezzük az engedélyezett belső toolokat MCP formátumra
  return {
    tools: allowedTools.map(toolName => {
      // LLM-barát alapértelmezett sémák generálása
      let description = `Executes ${toolName} within the ${manifest.identity.world.name} world context.`;
      let inputSchema = { type: "object", properties: { arguments: { type: "array", items: { type: "string" }, description: "Raw arguments for the tool" } } };

      // Kiemelt fontosságú toolok felokosítása strukturált paraméterekkel az LLM számára
      if (toolName === "shell_exec") {
        description = `Runs an authorized shell command in the Android edge environment. Forbidden: ${manifest.authority.boundaries.forbidden.join(", ")}`;
        inputSchema = {
          type: "object",
          properties: {
            command: { type: "string", description: "The shell command to execute." }
          },
          required: ["command"]
        };
      } else if (toolName === "append_to_research_trace") {
        description = "Appends a new logical step or observation to the active research trace pipeline.";
        inputSchema = {
          type: "object",
          properties: {
            log_entry: { type: "string", description: "The research data or log text to append." }
          },
          required: ["log_entry"]
        };
      }

      return {
        name: toolName,
        description: description,
        inputSchema: inputSchema
      };
    })
  };
});

// 3. BIZTONSÁGOS ESZKÖZ-VÉGREHAJTÁS (Policy Enforcement Layer)
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const manifest = await getManifest();

  // Biztonsági ellenőrzés 1: Benne van a tool_scope-ban?
  if (!manifest.authority.boundaries.tool_scope.includes(name)) {
    return { isError: true, content: [{ type: "text", text: `Security Exception: Tool '${name}' is out of authorized scope.` }] };
  }

  // Biztonsági ellenőrzés 2: Próbálkozik a tiltott parancsok (forbidden) mintáival?
  const stringifiedArgs = JSON.stringify(args);
  for (const forbiddenPattern of manifest.authority.boundaries.forbidden) {
    if (stringifiedArgs.includes(forbiddenPattern)) {
      return { isError: true, content: [{ type: "text", text: `Security Exception: Execution blocked. Input violates 'forbidden' policy: ${forbiddenPattern}` }] };
    }
  }

  // Ha a validáció sikeres, továbbítjuk a meglévő HTTP runtime-nak
  try {
    const response = await fetch(`${RUNTIME_URL}/execute`, { // Feltételezve, hogy a serverem.js itt fogadja a végrehajtást
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: name,
        params: args,
        context: {
          project: manifest.active_project || manifest.identity.world.name,
          contract_version: manifest.contracts.version
        }
      })
    });

    const result = await response.json();
    return { content: [{ type: "text", text: JSON.stringify(result) }] };

  } catch (error) {
    return { isError: true, content: [{ type: "text", text: `Runtime gateway error: ${error.message}` }] };
  }
});

// 4. ERŐFORRÁSOK (Resources) MINT MCP EXPOSURE
// A fejlett orchestrator így közvetlenül belelát a kutatási nyomvonalba vagy a health állapotba
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "arcsi://research/trace",
        name: "Current Research Trace",
        mimeType: "application/json",
        description: "Active pipeline lineage and trace-based reasoning log."
      },
      {
        uri: "arcsi://system/health",
        name: "Runtime Health & Score",
        mimeType: "application/json",
        description: "Current uptime, safety score, and cloud provider status."
      }
    ]
  };
});

// Erőforrás konkrét tartalmának kiszolgálása
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  const manifest = await getManifest();

  if (uri === "arcsi://system/health") {
    return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(manifest.health) }] };
  }
  if (uri === "arcsi://research/trace") {
    return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify({ project: manifest.active_project, contracts: manifest.contracts }) }] };
  }
  throw new Error("Resource not found");
});

// 5. Indítás Standard I/O-n keresztül az orchestrator számára
const transport = new StdioServerTransport();
await server.connect(transport);
