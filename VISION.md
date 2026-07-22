Arcsi Runtime — Vision
From Capability Manifest to Runtime Passport
One idea emerged during an unexpected discussion with the Better Agent project.
Initially, Arcsi described capabilities.
Over time, that idea evolved into something deeper.
The Evolution
V1 — Tool List
The first version was straightforward.
An instance simply reported the tools it could execute.

Json
{
  "tools": ["file_read", "shell_exec", "sandbox_write"]
}

The important difference: the role is not configured manually.
It is discovered.
Runtime Passport
Earlier versions of Arcsi described capabilities.
Runtime Passport describes identity.
It is not a declaration of what a runtime can execute, but a description of what it has become through its environment, responsibilities, and lived experience.
Beyond Capability Manifest
The evolution from Capability Manifest to Runtime Passport is not a rename.
It is a shift in perspective.
Capability Manifest
Runtime Passport
What can I execute?
What have I become?
Tool list
Identity description
Integration spec
Participant declaration
Configured
Earned
Structure
A Runtime Passport contains six sections.
identity — who this runtime is, what role it has developed, and how that role emerged.

Json
"identity": {
  "runtime": "arcsi-runtime",
  "version": "1.1.0",
  "environment": "android",
  "role": "edge-runtime",
  "derived_from": ["android", "mobile", "tasker", "notifications"],
  "specialization": {
    "emergent": true,
    "traits": ["notifications", "personal_context", "rapid_experimentation"],
    "confidence": 0.85,
    "history": ["edge_runtime", "tasker_integration"]
  },
  "world": {
    "name": "FIRSTT",
    "type": "research",
    "active": true,
    "knowledge_base": true
  }
}

capabilities — what is available, why, and from what source.

Json
"capabilities": {
  "notifications": { "available": true, "source": "android_system" },
  "tasker": { "available": true, "source": "android_automation" },
  "home_assistant": { "available": false, "reason": "not_configured" },
  "sandbox": { "available": true, "source": "local_filesystem" },
  "research_trace": { "available": true, "source": "project_context" }
}

communication — how this runtime prefers to be reached.

Json
"communication": {
  "channels": { "http": true, "mcp": false, "websocket": false },
  "preferred_channel": "http",
  "latency_class": "interactive"
}

authority — what this runtime is trusted to do, and what it cannot.

Json
"authority": {
  "trust_level": "local",
  "effective_role": "personal-edge-agent",
  "boundaries": {
    "tool_scope": ["file_read", "shell_exec", "sandbox_write"],
    "forbidden": ["rm_rf", "network_exposure"],
    "idempotency_required": false
  },
  "contract_limits": {
    "max_duration_ms": 180000,
    "max_depth": 20,
    "requires_approval": true
  }
}

reasoning — how this runtime thinks, not just what it executes.


Json
"reasoning": {
  "trace_based": true,
  "policy_layer": true,
  "working_worlds": true,
  "reflection": false,
  "supports_research": true
}

health — the current state of this runtime.


Json
"health": {
  "uptime": "4h 23m",
  "score": 87,
  "provider_status": {
    "ollama_cloud": "active",
    "gemini": "standby"
  }
}

Emergent Roles
Arcsi was never designed with predefined roles.
The distinction between Edge Runtime and Core Runtime appeared naturally during everyday use.
The Android instance gradually became responsible for:
notifications
Tasker automation
personal interaction
rapid experimentation
The Proxmox instance naturally evolved toward:
Home Assistant
MQTT
qBittorrent
infrastructure
long-running services
Same runtime.
Different specialization.
The environment itself shaped the role.
A Runtime Does Not Use a World
A runtime does not "use" a Working World.
It lives in one.
Therefore, the Passport does not merely state "who I am" — it also states "which world I belong to."
The world field is not a pointer to a data structure.
It is a declaration of belonging.
The Reasoning Layer
Every capability protocol describes what a runtime can execute.
Runtime Passport adds something new: a description of how a runtime thinks.
The reasoning block is not about tools.
It is about cognition.
A runtime that supports trace_based reasoning records its own thinking.
A runtime with a policy_layer does not just execute — it decides.
A runtime with working_worlds does not just process requests — it operates within a context.
This is the difference between a remote executor and a participant.
A Shared Insight
This vision did not emerge in isolation.
An external perspective from the Better Agent project highlighted the importance of capability discovery for distributed execution.
Looking from the outside suggested an integration protocol.
Looking from the inside revealed something deeper:
Capability manifests are not only about interoperability.
They are also about identity.
Issuance
The Runtime Passport is not issued by a central authority.
It is earned through interaction with the environment.
Every Arcsi instance writes its own passport by living in its world.


A Runtime Passport is not written before deployment.
It is written by the runtime itself, through everyday operation.