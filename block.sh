#!/bin/bash

# Define the interface to block
INTERFACE="enp34s0"

echo "Flushing existing iptables rules..."
sudo iptables -F
sudo iptables -X

echo "Blocking all incoming and outgoing traffic on $INTERFACE..."

# Block all incoming traffic on the specified interface
sudo iptables -A INPUT -i "$INTERFACE" -j DROP

# Block all outgoing traffic on the specified interface
sudo iptables -A OUTPUT -o "$INTERFACE" -j DROP

# Drop any existing established connections on this interface
sudo iptables -A INPUT -i "$INTERFACE" -m conntrack --ctstate ESTABLISHED,RELATED -j DROP
sudo iptables -A OUTPUT -o "$INTERFACE" -m conntrack --ctstate ESTABLISHED,RELATED -j DROP

echo "Current iptables rules:"
# List all iptables rules for verification
sudo iptables -L -v -n
