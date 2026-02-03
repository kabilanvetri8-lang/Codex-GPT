# Monitoring TCP_EXT_LISTEN_DROP and TCP_ACCEPTQ_BACKLOG

This note explains where the two counters live and how to observe them on a Linux host.

## What the counters are

These counters are part of the `TcpExt` group exposed in `/proc/net/netstat` and surfaced by tools like `nstat`. In particular:

- `TcpExt:ListenDrops` corresponds to **TCP_EXT_LISTEN_DROP** (drops on listening sockets).
- `TcpExt:ListenOverflows` corresponds to **TCP_ACCEPTQ_BACKLOG** (accept queue overflows / backlog limit reached).

You can read `/proc/net/netstat` directly or use `nstat` to collect them.

## Quick one-shot reads

### Using nstat

```bash
nstat -az | egrep 'TcpExtListenDrops|TcpExtListenOverflows'
```

### Reading /proc/net/netstat

```bash
awk 'NR==1 || $1=="TcpExt:" {print}' /proc/net/netstat | head -n 2
```

The first line contains field names (including `ListenDrops` and `ListenOverflows`) and the next line contains the values in the same order.

## Continuous monitoring (example)

Use `watch` to sample at an interval:

```bash
watch -n 1 "nstat -az | egrep 'TcpExtListenDrops|TcpExtListenOverflows'"
```

## Notes

- `ListenDrops` typically indicates packets dropped because the listen queue is full.
- `ListenOverflows` indicates the accept queue hit its backlog limit.

