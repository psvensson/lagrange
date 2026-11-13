# Fourth-host facts and explicit operator policy

Root invoked the independently reviewed commissioning diagnostic exactly once on
each host on 13 November 2026. The existing commissioning transport returned a
closed refusal on both calls; neither invocation admitted a workload or changed
remote configuration. Full stdout, stderr and result are retained in
`fourth-host-adam-laptop-observation-20261113-01/` and
`fourth-host-carinas-windows-observation-20261113-01/`.

Adam is native x86_64 Linux, uid 1001, home `/home/peter`. The real
`/mnt/old/lab` directory is on device 66306, inode 27000833, with
46,672,568,320 available bytes at observation. HOME has 8,012,836,864 available
bytes. Coretemp Package id 0 read 40 C; NVMe Composite read 17.85 C. These are
observations, not installed worker bindings. User systemd responded successfully;
linger is disabled. Normal doctor refused `FOREIGN_PATH_REFUSED` because the
current owner restricts worker state to HOME. The approved selected-storage repair
remains needed; shared `/mnt/old/lab/docker` is outside its scope.

Carina is x86_64 Linux under WSL2, uid 1000, home `/home/peter`. The bounded
hwmon enumeration completed without truncation and found zero devices. User
systemd responded successfully; linger is disabled. Normal doctor refused
`THERMAL_SENSORS_UNCONFIGURED`. Neither absence of sensor data nor the Linux kernel
identifies measured hardware temperatures.

After these observations the user explicitly instructed: "use carinas in teh same
was as you would adams laptop, so run thermally blind, but with the same cadence".
This supersedes the earlier requirement for measured thermal admission on Carina.
It authorizes an explicit operator-paced host policy, never automatic fallback
after a configured sensor fails. No user decision remains pending for this use.

Root's concrete initial pacing choice is one test file at a time and a five-second
rest after a file closes before the next file starts, on both laptops. The user
did not prescribe the five-second value; it is an operational choice using the
existing five-second cooling interval. It is not proof of a safe temperature.
Adam additionally keeps its real sensor limits and may hold longer. Carina keeps
unavailable temperatures explicit. Neither host pauses inside a running test or
benchmark sample, gains retries, or receives an extended admitted deadline.

The native owner must produce one explicit execution policy consumed by native
admission/monitoring and project file launch. Sensor-required mode continues to
refuse unavailable observation. Operator-paced mode is deliberate configuration;
it must not fabricate sensor readings or a measured-thermal READY verdict. New
contract producers supply the mode explicitly. Acceptance must cover both policy
paths and reject a failed required sensor without operator-paced authorization.

The sealed canonical-native-thermal-pacing original, original failed evidence,
and seal are preserved unchanged. The explicit new operator policy requires its
own recorded scope/acceptance amendment before candidate acceptance; it cannot
silently reinterpret that historical original or supply a receipt. This document
records authorization and intended source boundaries, not implemented capability,
host readiness, deployed policy, or completed tests.
