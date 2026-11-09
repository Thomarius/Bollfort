#!/bin/sh
# Makes the test bench's second machine, the VM "bollfort-guest" (STEAM.md 3.4): Ubuntu 24.04's
# cloud image, Xfce logged in by itself, Steam started with the desktop; 2 cores, 4 GB, a 30 GB
# disk, libvirt's default NAT network, a virtio GPU with 3D (virgl), the guest agent.
#
#   tools/steambench/vm/create.sh [STATE_DIR]     (default ~/vm/bollfort-guest)
#
# Needs: sudo apt install virt-manager qemu-system-x86 qemu-utils libvirt-daemon-system virtinst
# and membership of the libvirt group (run through `sg libvirt -c` before logging in again).
# The state folder gets the image and the VM's own SSH key, never the repository. After the first
# boot's setup (10-20 minutes, the VM then shuts down once: start it again), log the second
# Steam account in on the VM's desktop, once, with "Remember me".
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
STATE=${1:-$HOME/vm/bollfort-guest}
DISK=bollfort-guest.qcow2
IMAGE=noble-server-cloudimg-amd64.img
export LIBVIRT_DEFAULT_URI=qemu:///system
mkdir -p "$STATE"
cd "$STATE"

if virsh dominfo bollfort-guest >/dev/null 2>&1; then
  echo "bollfort-guest exists already"
  exit 1
fi
if [ ! -f "$IMAGE" ]; then
  curl -sfL -o SHA256SUMS https://cloud-images.ubuntu.com/noble/current/SHA256SUMS
  curl -fL -o "$IMAGE" "https://cloud-images.ubuntu.com/noble/current/$IMAGE"
  sha256sum -c --ignore-missing SHA256SUMS
fi
[ -f id_vm ] || ssh-keygen -q -t ed25519 -N "" -C bollfort-vm -f id_vm
sed "s|SSH_PUBLIC_KEY|$(cat id_vm.pub)|" "$HERE/user-data.template" > user-data
cp "$HERE/meta-data" meta-data

virsh net-autostart default >/dev/null
virsh net-start default 2>/dev/null || true
virsh pool-info default >/dev/null 2>&1 || virsh pool-define-as default dir --target /var/lib/libvirt/images
virsh pool-start default 2>/dev/null || true
# The disk in libvirt's own folder, so its qemu user may read it.
qemu-img convert -O qcow2 "$IMAGE" "/tmp/$DISK"
qemu-img resize "/tmp/$DISK" 30G
virsh vol-create-as default "$DISK" 30G --format qcow2 >/dev/null
virsh vol-upload --pool default "$DISK" "/tmp/$DISK"
rm "/tmp/$DISK"

virt-install \
  --name bollfort-guest \
  --memory 4096 --vcpus 2 --cpu host-passthrough \
  --osinfo ubuntu24.04 \
  --disk "vol=default/$DISK,bus=virtio" \
  --import \
  --cloud-init user-data=user-data,meta-data=meta-data \
  --network network=default,model=virtio \
  --graphics spice,gl.enable=yes,listen=none \
  --video virtio,accel3d=yes \
  --channel spicevmc \
  --channel unix,target.type=virtio,target.name=org.qemu.guest_agent.0 \
  --noautoconsole
virsh autostart bollfort-guest >/dev/null
echo "made; cloud-init installs the desktop and Steam, then the VM shuts down: start it again"
