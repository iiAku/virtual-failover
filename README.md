# Virtual Failover

**Virtual Failover** is a Bun/Node.js application that provides a VRRP-like (Virtual Router Redundancy Protocol) failover mechanism using `nmcli` for network management. Designed for Linux systems, it monitors multiple network interfaces and switches between primary and backup interfaces based on network connectivity status.

The application is built with [NestJS](https://nestjs.com) and leverages [Bun](https://bun.sh) or Node.js for runtime.

Note: At home this is currently running in "production", but this project is very experimental and there are still grey area or extra things you'll have to make it work as expected.

---

## Features

- Monitors connectivity on 2 (default) or 3 (optional for the third, which is a fallback) network interfaces.
- Automatically switches to the backup interface if the primary interface fails.
- Restores the primary interface when connectivity is regained.
- Configurable delay-based ping monitoring.
- Lightweight and optimized for Linux systems using `nmcli`.

---

## What it's looks like when running:

```bash
[23:24:35.656] INFO (3565008): PRIMARY connection is up ✅
[23:24:35.656] INFO (3565008): BACKUP connection is up ✅
[23:24:40.657] INFO (3565008): Checking connectivity against
[23:24:40.658] INFO (3565008): Checking connectivity against
[23:24:41.674] INFO (3565008): PRIMARY connection is down ❌
[23:24:41.674] INFO (3565008): BACKUP connection is up ✅
[23:24:42.788] INFO (3565008): Connection BACKUP (enp88s0) reconnected successfully
[23:24:42.788] INFO (3565008): Connection BACKUP (enp88s0)) took 319ms to restart.
[23:24:42.788] INFO (3565008): Connection BACKUP (enp88s0) priority set to 100
[23:24:44.510] INFO (3565008): Connection PRIMARY (enp89s0) reconnected successfully
[23:24:44.510] INFO (3565008): Connection PRIMARY (enp89s0)) took 321ms to restart.
[23:24:44.510] INFO (3565008): Connection PRIMARY (enp89s0) priority set to 200
[23:24:45.013] ERROR (3565008): Primary connection is down ❌ - Activating backup/fallback 🔄
[23:24:50.013] INFO (3565008): Checking connectivity against
[23:24:50.014] INFO (3565008): Checking connectivity against
[23:24:50.248] INFO (3565008): PRIMARY connection is up ✅
[23:24:50.248] INFO (3565008): BACKUP connection is up ✅
[23:24:51.299] INFO (3565008): Connection PRIMARY (enp89s0) reconnected successfully
[23:24:51.300] INFO (3565008): Connection PRIMARY (enp89s0)) took 332ms to restart.
[23:24:51.300] INFO (3565008): Connection PRIMARY (enp89s0) priority set to 100
[23:24:52.835] INFO (3565008): Connection BACKUP (enp88s0) reconnected successfully
[23:24:52.835] INFO (3565008): Connection BACKUP (enp88s0)) took 304ms to restart.
[23:24:52.835] INFO (3565008): Connection BACKUP (enp88s0) priority set to 200
[23:24:53.336] INFO (3565008): Primary connection is back up ✅ - Switching back to primary.
[23:24:58.337] INFO (3565008): Checking connectivity against
[23:24:58.338] INFO (3565008): Checking connectivity against
[23:24:58.540] INFO (3565008): PRIMARY connection is up ✅
[23:24:58.540] INFO (3565008): BACKUP connection is up ✅
[23:25:03.543] INFO (3565008): Checking connectivity against
[23:25:03.544] INFO (3565008): Checking connectivity against
[23:25:04.563] INFO (3565008): PRIMARY connection is up ✅
[23:25:04.563] INFO (3565008): BACKUP connection is down ❌
[23:25:09.566] INFO (3565008): Checking connectivity against
[23:25:09.567] INFO (3565008): Checking connectivity against

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
          sudo nano /etc/netplan/50-cloud-init.yaml
       ```

       ```yaml
      network:
         version: 2
         renderer: NetworkManager
         ethernets:
            eth0:
            dhcp4: no
            addresses:
              - 192.168.1.100/24 //set static IP primary
            nameservers:
            addresses:
              - 1.1.1.1
              - 8.8.8.8
              - 8.8.4.4
              - 208.67.222.222
              - 208.67.220.220
           eth1:
              dhcp4: no
              addresses:
               - 192.168.2.100/24 //set static IP backup
           eth3:
              dhcp4: no
              addresses:
              - 192.168.3.100/24 //set static IP fallback if any
         ```

    >      **Note**: Replace `eth0`, `eth1` and `eth3` with your primary, backup and fallback (if any) network interfaces.
    
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
             action.id == "org.freedesktop.NetworkManager.enable-disable-wifi" );
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

`FALLBACK_CONNECTION`: Name of the fallback network interface (e.g., eth3). Optional.

Example `.env` file:

```bash
PRIMARY_CONNECTION=eth0
PRIMARY_CHECK_INTERVAL_IN_SECONDS=5
BACKUP_CONNECTION=eth1
BACKUP_CHECK_INTERVAL_IN_SECONDS=30
FALLBACK_CONNECTION=eth3
```

> **Note**: Adjust the values based on your network configuration and needs

---

### Part 4: Usage

1. Start the application:
   ```bash
   # Git clone
   
   #Install dependencies
   bun install
   
   # Build the application
   bun build
   
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

   >      **Note**: Replace `eth0`, `eth1` and `eth3` with your primary, backup and fallback (if any) network interfaces.

3. Monitor logs:
    ```bash
    pm2 logs VRRP
    ```