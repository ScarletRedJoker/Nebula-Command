#!/bin/bash

set -e

VNC_USER=${VNC_USER:-evin}
USER_HOME="/home/${VNC_USER}"

echo "============================================"
echo "  VNC Desktop Bootstrap"
echo "  User: ${VNC_USER}"
echo "  Home: ${USER_HOME}"
echo "============================================"

if [ -f "${USER_HOME}/.desktop_provisioned" ]; then
    echo "Desktop already provisioned. Skipping bootstrap."
    exit 0
fi

echo "Creating XDG user directories..."
mkdir -p "${USER_HOME}/Desktop"
mkdir -p "${USER_HOME}/Documents"
mkdir -p "${USER_HOME}/Downloads"
mkdir -p "${USER_HOME}/Pictures"
mkdir -p "${USER_HOME}/Videos"
mkdir -p "${USER_HOME}/Music"
mkdir -p "${USER_HOME}/Projects"

echo "Creating desktop shortcuts..."
cat > "${USER_HOME}/Desktop/Firefox.desktop" << 'EOF'
[Desktop Entry]
Version=1.0
Name=Firefox Web Browser
Comment=Browse the World Wide Web
GenericName=Web Browser
Keywords=Internet;WWW;Browser;Web;Explorer
Exec=firefox %u
Terminal=false
X-MultipleArgs=false
Type=Application
Icon=firefox
Categories=GNOME;GTK;Network;WebBrowser;
MimeType=text/html;text/xml;application/xhtml+xml;application/xml;application/rss+xml;application/rdf+xml;image/gif;image/jpeg;image/png;x-scheme-handler/http;x-scheme-handler/https;x-scheme-handler/ftp;x-scheme-handler/chrome;video/webm;application/x-xpinstall;
StartupNotify=true
Actions=NewWindow;NewPrivateWindow;
EOF

cat > "${USER_HOME}/Desktop/Terminal.desktop" << 'EOF'
[Desktop Entry]
Name=Terminal
Comment=Use the command line
TryExec=gnome-terminal
Exec=gnome-terminal
Icon=utilities-terminal
Type=Application
Categories=GNOME;GTK;System;TerminalEmulator;
StartupNotify=true
OnlyShowIn=GNOME;Unity;
Keywords=Run;
Actions=new-window;
X-Ubuntu-Gettext-Domain=gnome-terminal
EOF

cat > "${USER_HOME}/Desktop/File Manager.desktop" << 'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Exec=thunar %F
Icon=system-file-manager
Terminal=false
StartupNotify=true
Categories=System;FileTools;FileManager;
OnlyShowIn=GNOME;LXDE;XFCE;
Keywords=folders;filesystem;explorer;
Name=File Manager
GenericName=File Manager
Comment=Browse the file system
EOF

cat > "${USER_HOME}/Desktop/homelab-dashboard.desktop" << 'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=Homelab Dashboard
Comment=Access Homelab Control Panel
Exec=firefox https://host.evindrake.net
Icon=applications-internet
Terminal=false
Categories=Network;WebBrowser;
EOF

cat > "${USER_HOME}/Desktop/Projects.desktop" << 'EOF'
[Desktop Entry]
Type=Link
Name=Projects Folder
Icon=folder-code
URL=file:///home/evin/host-projects
EOF

echo "Making desktop shortcuts executable..."
chmod +x "${USER_HOME}/Desktop/"*.desktop

echo "Creating LXQt panel configuration..."
mkdir -p "${USER_HOME}/.config/lxpanel/LXDE/panels"

cat > "${USER_HOME}/.config/lxpanel/LXDE/panels/panel" << 'EOF'
Global {
  edge=bottom
  allign=center
  margin=0
  widthtype=percent
  width=100
  height=36
  transparent=0
  tintcolor=#000000
  alpha=0
  autohide=0
  heightwhenhidden=2
  setdocktype=1
  setpartialstrut=1
  usefontcolor=0
  fontcolor=#ffffff
  background=0
  backgroundfile=/usr/share/lxpanel/images/background.png
  iconsize=24
}
Plugin {
  type=space
  Config {
    Size=2
  }
}
Plugin {
  type=menu
  Config {
    image=start-here
    system {
    }
    separator {
    }
    item {
      command=run
    }
    separator {
    }
    item {
      image=gnome-logout
      command=logout
    }
  }
}
Plugin {
  type=launchbar
  Config {
    Button {
      id=firefox.desktop
    }
    Button {
      id=gnome-terminal.desktop
    }
    Button {
      id=thunar.desktop
    }
  }
}
Plugin {
  type=space
  Config {
    Size=4
  }
}
Plugin {
  type=taskbar
  expand=1
  Config {
    tooltips=1
    IconsOnly=0
    ShowAllDesks=0
    UseMouseWheel=1
    UseUrgencyHint=1
    FlatButton=0
    MaxTaskWidth=150
    spacing=1
    GroupedTasks=0
  }
}
Plugin {
  type=tray
}
Plugin {
  type=dclock
  Config {
    ClockFmt=%R
    TooltipFmt=%A %x
    BoldFont=0
    IconOnly=0
    CenterText=0
  }
}
EOF

echo "Setting ownership..."
chown -R ${VNC_USER}:${VNC_USER} "${USER_HOME}/.config"
chown -R ${VNC_USER}:${VNC_USER} "${USER_HOME}/Desktop"
chown -R ${VNC_USER}:${VNC_USER} "${USER_HOME}/Documents"
chown -R ${VNC_USER}:${VNC_USER} "${USER_HOME}/Downloads"
chown -R ${VNC_USER}:${VNC_USER} "${USER_HOME}/Pictures"
chown -R ${VNC_USER}:${VNC_USER} "${USER_HOME}/Videos"
chown -R ${VNC_USER}:${VNC_USER} "${USER_HOME}/Music"
chown -R ${VNC_USER}:${VNC_USER} "${USER_HOME}/Projects"

echo "Provisioning complete!"
touch "${USER_HOME}/.desktop_provisioned"

echo "============================================"
echo "  VNC Desktop Ready!"
echo "  Access at: https://vnc.evindrake.net"
echo "============================================"
