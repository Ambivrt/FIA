# CLI-kommandon (referens)

!!! info "Auto-genererad"
Denna sida genereras från `fia --help`. Senast uppdaterad: 2026-03-25

## fia

```
Usage: fia [options] [command]

FIA CLI – Terminal interface for Forefront Intelligent Automation

Options:
  -V, --version                 output the version number
  -h, --help                    display help for command

Commands:
  status                        Show FIA system status overview
  agents [options] [slug]       List all agents or show details for a specific
                                agent
  run [options] <agent> <task>  Trigger a task manually on an agent
  queue [options]               Show queued and running tasks
  approve [options] <task-id>   Approve a task
  reject [options] <task-id>    Reject a task (feedback required)
  kill [options]                Activate the kill switch (pauses ALL agents)
  resume                        Deactivate the kill switch (resume all agents)
  logs [options]                Show activity log
  tail [options]                Live-stream activity log (Ctrl+C to stop)
  watch                         Live mini-dashboard (Ctrl+C to stop)
  config [options] [agent]      View or edit agent configuration
  triggers [options]            Manage declarative triggers and pending trigger
                                queue
  lineage <task-id>             Show task parent/child relationship tree
  cron [options]                Manage scheduled cron jobs
```

---

## fia status

```
Usage: fia status [options]

Show FIA system status overview

Options:
  -h, --help  display help for command
```

## fia agents

```
Usage: fia agents [options] [slug]

List all agents or show details for a specific agent

Options:
  --verbose   Show full details
  -h, --help  display help for command
```

## fia run

```
Usage: fia run [options] <agent> <task>

Trigger a task manually on an agent

Options:
  --priority <level>  Task priority (low, normal, high, urgent) (default:
                      "normal")
  --title <title>     Optional task title
  -h, --help          display help for command
```

## fia queue

```
Usage: fia queue [options]

Show queued and running tasks

Options:
  --verbose   Show full task IDs
  -h, --help  display help for command
```

## fia approve

```
Usage: fia approve [options] <task-id>

Approve a task

Options:
  --feedback <text>  Optional feedback message
  -h, --help         display help for command
```

## fia reject

```
Usage: fia reject [options] <task-id>

Reject a task (feedback required)

Options:
  --feedback <text>  Feedback message (required)
  -h, --help         display help for command
```

## fia kill

```
Usage: fia kill [options]

Activate the kill switch (pauses ALL agents)

Options:
  --force     Skip confirmation prompt
  -h, --help  display help for command
```

## fia resume

```
Usage: fia resume [options]

Deactivate the kill switch (resume all agents)

Options:
  -h, --help  display help for command
```

## fia logs

```
Usage: fia logs [options]

Show activity log

Options:
  --agent <slug>     Filter by agent
  --action <action>  Filter by action type
  --limit <n>        Number of entries to show (default: "10")
  --verbose          Show full timestamps and IDs
  -h, --help         display help for command
```

## fia tail

```
Usage: fia tail [options]

Live-stream activity log (Ctrl+C to stop)

Options:
  --agent <slug>  Filter by agent slug
  -h, --help      display help for command
```

## fia watch

```
Usage: fia watch [options]

Live mini-dashboard (Ctrl+C to stop)

Options:
  -h, --help  display help for command
```

## fia config

```
Usage: fia config [options] [agent]

View or edit agent configuration

Options:
  --routing [assignment]  Show or set routing (e.g. metadata=claude-opus)
  --tools                 Show tools configuration
  -h, --help              display help for command
```

## fia triggers

```
Usage: fia triggers [options] [command]

Manage declarative triggers and pending trigger queue

Options:
  --agent <slug>                  Filter by agent slug
  --status <status>               Filter by status (pending|executed|rejected)
                                  (default: "pending")
  -h, --help                      display help for command

Commands:
  approve [options] <trigger-id>  Approve a pending trigger (creates downstream
                                  task)
  reject [options] <trigger-id>   Reject a pending trigger
  config [options] [agent]        View or toggle trigger configuration per
                                  agent
  reseed [options] [agent]        Reseed trigger configuration from agent.yaml
                                  (dry-run by default)
```

## fia lineage

```
Usage: fia lineage [options] <task-id>

Show task parent/child relationship tree

Options:
  -h, --help  display help for command
```

## fia cron

```
Usage: fia cron [options] [command]

Manage scheduled cron jobs

Options:
  --agent <slug>         Filter by agent slug
  -h, --help             display help for command

Commands:
  create [options]       Create a new scheduled cron job
  edit [options] <id>    Edit a scheduled cron job
  delete [options] <id>  Delete a scheduled cron job
  enable <id>            Enable a scheduled cron job
  disable <id>           Disable a scheduled cron job
```
