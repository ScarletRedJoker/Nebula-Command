FROM dorowu/ubuntu-desktop-lxde-vnc:latest

ENV DEBIAN_FRONTEND=noninteractive \
    VNC_USER=evin \
    USER_UID=1000 \
    USER_GID=1000

USER root

RUN apt-get update && apt-get install -y \
    firefox \
    chromium-browser \
    gnome-terminal \
    thunar \
    mousepad \
    gimp \
    vlc \
    libreoffice \
    git \
    curl \
    wget \
    vim \
    nano \
    htop \
    neofetch \
    python3 \
    python3-pip \
    nodejs \
    npm \
    dbus-x11 \
    gvfs \
    gvfs-backends \
    xdg-desktop-portal \
    xdg-desktop-portal-gtk \
    xdg-utils \
    xdg-user-dirs \
    desktop-file-utils \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -g ${USER_GID} ${VNC_USER} || true && \
    useradd -m -u ${USER_UID} -g ${USER_GID} -s /bin/bash ${VNC_USER} || usermod -l ${VNC_USER} ubuntu

COPY bootstrap.sh /usr/local/bin/bootstrap.sh
RUN chmod +x /usr/local/bin/bootstrap.sh

COPY desktop-shortcuts /tmp/desktop-shortcuts

USER ${VNC_USER}

RUN mkdir -p /home/${VNC_USER}/.config/lxpanel/LXDE/panels && \
    mkdir -p /home/${VNC_USER}/Desktop && \
    mkdir -p /home/${VNC_USER}/.local/share/applications

USER root

ENTRYPOINT ["/bin/bash", "-c", "/usr/local/bin/bootstrap.sh && /startup.sh"]
