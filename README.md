# Virtual Failover

**Virtual Failover** is a Bun/Node.js application that provides a VRRP-like (Virtual Router Redundancy Protocol) failover mechanism using `nmcli` for network management. Designed for Linux systems, it monitors multiple network interfaces and switches between primary and backup interfaces based on network connectivity status.

The application is built with [NestJS](https://nestjs.com) and leverages [Bun](https://bun.sh) or Node.js for runtime.

---

## Features

- Monitors connectivity on two network interfaces.
- Automatically switches to the backup interface if the primary interface fails.
- Restores the primary interface when connectivity is regained.
- Configurable delay-based ping monitoring.
- Lightweight and optimized for Linux systems using `nmcli`.

---

## What it's looks like when running:

```bash
[16:50:00.438] WARN (1470255): Primary connection seems to be down, checking again
[16:50:00.438] INFO (1470255): Checking connectivity against
[16:50:00.438] INFO (1470255): Checking connectivity against
[16:50:01.453] INFO (1470255): Current check interval is 5 seconds
[16:50:01.453] INFO (1470255): Primary connection is down ❌
[16:50:01.453] INFO (1470255): Backup connection is up ✅
[16:50:01.453] INFO (1470255): Connection state is PRIMARY
[16:50:02.515] INFO (1470255): Setting route priority for connection eth0
[16:50:03.427] INFO (1470255): Setting route priority for connection eth1
[16:50:03.738] INFO (1470255): Connection (eth0) took 1223ms to restart.
[16:50:03.738] INFO (1470255): Connection (eth0) ipv4.route-metric=300 ✅
[16:50:03.738] INFO (1470255): Connection (eth0) ipv6.route-metric=300 ✅
[16:50:03.738] INFO (1470255): Connection (eth0) connection.autoconnect-priority=200 ✅
[16:50:03.751] INFO (1470255): Connection (eth1) took 323ms to restart.
[16:50:03.751] INFO (1470255): Connection (eth1) ipv4.route-metric=100 ✅
[16:50:03.751] INFO (1470255): Connection (eth1) ipv6.route-metric=100 ✅
[16:50:03.751] INFO (1470255): Connection (eth1) connection.autoconnect-priority=400 ✅
[16:50:03.751] INFO (1470255): Changing from PRIMARY to BACKUP connection is active.
[16:50:03.751] INFO (1470255): Primary connection is down ❌ - Activating backup 🔄
[16:50:04.423] INFO (1470255): Checking connectivity against
[16:50:04.424] INFO (1470255): Checking connectivity against
[16:50:05.440] INFO (1470255): Current check interval is 30 seconds
[16:50:05.440] INFO (1470255): Primary connection is up ✅
[16:50:05.440] INFO (1470255): Backup connection is down ❌
[16:50:05.440] INFO (1470255): Connection state is BACKUP
[16:50:06.448] INFO (1470255): Setting route priority for connection eth0
[16:50:07.334] INFO (1470255): Setting route priority for connection eth1
[16:50:07.622] INFO (1470255): Connection (eth1) took 288ms to restart.
[16:50:07.622] INFO (1470255): Connection (eth1) ipv4.route-metric=300 ✅
[16:50:07.622] INFO (1470255): Connection (eth1) ipv6.route-metric=300 ✅
[16:50:07.622] INFO (1470255): Connection (eth1) connection.autoconnect-priority=200 ✅
[16:50:07.637] INFO (1470255): Connection (eth0) took 1188ms to restart.
[16:50:07.637] INFO (1470255): Connection (eth0) ipv4.route-metric=200 ✅
[16:50:07.637] INFO (1470255): Connection (eth0) ipv6.route-metric=200 ✅
[16:50:07.637] INFO (1470255): Connection (eth0) connection.autoconnect-priority=300 ✅
[16:50:07.637] INFO (1470255): Changing from BACKUP to PRIMARY connection is active.
[16:50:07.637] INFO (1470255): Primary connection is back up ✅ - Switching back to primary.
```

## Requirements

1. **System requirements**:
    - Linux with `nmcli` installed and configured as the network manager.
    - Two network interfaces with static IP configuration (recommended).
    - User permissions to manage network interfaces (see [Setup](#setup)).

2. **Software requirements**:
    - [Bun](https://bun.sh) (preferred) or Node.js.
    - [PM2](https://pm2.keymetrics.io/) for process management (optional).

---
### Part 1: Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/iiAku/virtual-failover.git
   cd virtual-failover
   
2. Install dependencies using Bun or npm:
   ```bash
   bun install
   # OR
   npm install
    ```
---

### Part 2: Configuration


3. Ensure `nmcli` is installed:
   ```bash
   sudo apt install network-manager
    ```
4. Configure netplan to use nmcli as the renderer (example config):

    ```bash
       sudo nano /etc/netplan/01-netcfg.yaml
    ```

    ```yaml
    network:
      version: 2
      ethernets:
        eth0:
          addresses:
            - 192.168.1.100/24
          gateway4: 192.168.1.1
          nameservers:
            addresses: [8.8.8.8, 8.8.4.4]
        eth1:
          addresses:
            - 192.168.2.100/24
          gateway4: 192.168.2.1
          nameservers:
            addresses: [8.8.8.8, 8.8.4.4]
      renderer: NetworkManager
    ```

    > **Note**: Replace `eth0` and `eth1` with your primary and backup network interfaces.
    
5. Apply the netplan configuration:
    ```bash
        sudo netplan apply
    ```

---
### Part 3: Permissions and Environment Variables


### User Permissions

By default, managing network interfaces requires root privileges. To allow non-root execution, create the following `polkit` rules:

1. Create a new policy file:
   ```bash
   sudo nano /etc/polkit-1/rules.d/10-network-manager.rules
    ```
2. Add the following rules:

    ```bash
    polkit.addRule(function(action, subject) {
        if ((action.id == "org.freedesktop.NetworkManager.network-control" ||
             action.id == "org.freedesktop.NetworkManager.settings.modify.system" ||
             action.id == "org.freedesktop.NetworkManager.settings.modify.own" ||
             action.id == "org.freedesktop.NetworkManager.enable-disable-wifi" ||
             action.id == "org.freedesktop.NetworkManager.enable-disable-network" ||
             action.id == "org.freedesktop.NetworkManager.settings.modify.hostname") &&
            subject.user == "YOUR_LINUX_USER") {
            return polkit.Result.YES;
        }
    });
    ```

    > **Note**: Replace `YOUR_LINUX_USER` with your Linux username.

---

### Environment Variables

    Create a `.env` file in the project root and add the following environment variables:


### Description
`PRIMARY_CONNECTION`: Name of the primary network interface (e.g., eth0).

`PRIMARY_CHECK_INTERVAL_IN_SECONDS`: Interval (in seconds) to check the primary connection's status. Default: 5.

`BACKUP_CONNECTION`: Name of the backup network interface (e.g., eth1).

`BACKUP_CHECK_INTERVAL_IN_SECONDS`: Interval (in seconds) to check the backup connection's status. Default: 30.


Example `.env` file:

```bash
PRIMARY_CONNECTION=eth0
PRIMARY_CHECK_INTERVAL_IN_SECONDS=5
BACKUP_CONNECTION=eth1
BACKUP_CHECK_INTERVAL_IN_SECONDS=30
```

> **Note**: Adjust the values based on your network configuration and needs

---

### Part 4: Usage

1. Start the application:
   ```bash
   # Using Bun
   bun run start

   # OR Using npm
   npm start
   ```
   
2. For production, you can use PM2 with environment variables:

    See https://www.npmjs.com/package/pm2 if not installed.

    ```bash
    PRIMARY_CONNECTION=eth1 BACKUP_CONNECTION=eth2 pm2 start bun --no-automation --name "VRRP" -- run start:prod
    ```
   
    > **Note**: Replace `eth0` and `eth1` with your primary and backup network interfaces.

3. Monitor logs:
    ```bash
    pm2 logs VRRP
    ```