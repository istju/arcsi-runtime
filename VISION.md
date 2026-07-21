Capability Manifest V3 (Vision)
One idea emerged during an unexpected discussion with the Better Agent project.
Initially, Capability Manifest was simply a way for an Arcsi instance to describe the tools it exposes.
Over time, that idea began to evolve.
V1 — Tool List
The first version was straightforward.
An instance simply reported the tools it could execute.
{
  "tools": [
    "file_read",
    "shell_exec",
    "sandbox_write"
  ]
}
Useful, but incomplete.
Knowing what an instance can execute says very little about what that instance actually is.
V2 — Tools + Features
The next step was adding environmental features.
{
  "tools": [...],
  "features": {
    "agent_mode": true,
    "instance_call": true,
    "home_assistant": true,
    "mqtt": true
  }
}
This answers an important question:
"Which capabilities are available on this runtime?"
But another realization followed.
V3 — Identity
A runtime is not merely a collection of tools.
It is an environment.
It has physical constraints.
It has responsibilities.
It develops a role.
Capability Manifest V3 describes the runtime itself.
{
  "identity": {
    "runtime": "arcsi-runtime",
    "environment": "android",
    "role": "edge-runtime"
  },

  "capabilities": {
    ...
  }
}
The important difference is that the role is not configured manually.
It is discovered.
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
Beyond Tools
A future Capability Manifest may eventually describe:
identity
environment
available services
communication methods
trust level
authority boundaries
specialization
health
contracts
protocol version
Instead of asking:
"Which tools do you have?"
another runtime could ask:
"Who are you?"
Why This Matters
Distributed systems usually describe endpoints.
Arcsi aims to describe participants.
A runtime is not simply a remote executor.
It is an autonomous environment with its own strengths, limitations, and responsibilities.
This makes collaboration between runtimes more natural than simple remote procedure calls.
A Shared Insight
This vision did not emerge in isolation.
An external perspective from the Better Agent project highlighted the importance of capability discovery for distributed execution.
Looking from the outside suggested an integration protocol.
Looking from the inside revealed something deeper:
Capability manifests are not only about interoperability.
They are also about identity.
That combination transformed a practical integration idea into a broader architectural direction for Arcsi Runtime.
I especially like the closing sentence because it captures the spirit of what happened:
Capability Manifest V3 is not about telling another runtime what Arcsi can do. It is about allowing Arcsi to describe what it has naturally become.
That ties directly back to your Emergent Specialization philosophy, and it gives the document a distinct identity rather than making it feel like another API proposal.
