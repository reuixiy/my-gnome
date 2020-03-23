# my-gnome

![gnome-version](https://img.shields.io/badge/GNOME-v3.36.0%2B-blue?logo=gnome)

My GNOME themes, shell extensions, and more.

![my-gnome.png](https://raw.githubusercontent.com/reuixiy/io-oi.me/master/static/images/my-gnome.png)

## usage

```sh
git clone https://github.com/reuixiy/my-gnome.git --depth 1
cd my-gnome

# themes
cp -r themes/* ~/.themes/
gsettings set org.gnome.desktop.interface gtk-theme 'Mc-OS-CTLina-Gnome-Dark-1.3'

# gnome shell extensions
cp -r shell-extensions/* ~/.local/share/gnome-shell/extensions/
gnome-extensions enable CoverflowAltTab\@dmo60.de
gnome-extensions enable dash-to-dock\@micxgx.gmail.com
gnome-extensions enable hidetopbar\@mathieu.bidon.ca
gnome-extensions enable simplenetspeed\@biji.extension
gnome-extensions enable TopIcons\@phocean.net
gnome-extensions enable workspaces-to-dock\@passingthru67.gmail.com
dconf load /org/gnome/shell/extensions/ < shell-extensions/config.toml

# gedit
cp -r gedit/* ~/.local/share/gedit/
dconf load /org/gnome/gedit/plugins/ < gedit/plugins/config.toml

# icons
cd ~/.icons
git clone https://github.com/PapirusDevelopmentTeam/papirus-icon-theme --depth 1
cp -r papirus-icon-theme/Papirus-Dark/* Papirus-Dark/
gsettings set org.gnome.desktop.interface icon-theme 'Papirus-Dark'
```

## todo

- [ ] shell script

## acknowledgement

1. https://gist.github.com/balderclaassen/d12cfb70b1695c11402116d8b7f79059
