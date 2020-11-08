/**
 * This file is part of Hide Top Bar
 *
 * Copyright 2020 Thomas Vogt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const Clutter = imports.gi.Clutter;

const Main = imports.ui.main;
const Layout = imports.ui.layout;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Intellihide = Me.imports.intellihide;
const DEBUG = Convenience.DEBUG;

const MessageTray = Main.messageTray;
const PanelBox = Main.layoutManager.panelBox;
const ShellActionMode = (Shell.ActionMode)?Shell.ActionMode:Shell.KeyBindingMode;

var PanelVisibilityManager = class HideTopBar_PanelVisibilityManager {

    constructor(settings, monitorIndex) {
        this._monitorIndex = monitorIndex;
        this._base_y = PanelBox.y;
        this._settings = settings;
        this._preventHide = false;
        this._intellihideBlock = false;
        this._staticBox = new Clutter.ActorBox();
        this._animationActive = false;
        this._shortcutTimeout = null;

        Main.layoutManager.removeChrome(PanelBox);
        Main.layoutManager.addChrome(PanelBox, {
            affectsStruts: false,
            trackFullscreen: true
        });

        // We lost the original notification's position because of PanelBox->affectsStruts = false
        // and now it appears beneath the top bar, fix it
        this._oldTween = MessageTray._tween;
        MessageTray._tween = function(actor, statevar, value, params)
        {
            params.y += (PanelBox.y < 0 ? 0 : PanelBox.height);
            this._oldTween.apply(MessageTray, arguments);
        }.bind(this);

        // Load settings
        this._bindSettingsChanges();
        this._updateSettingsMouseSensitive();
        this._intellihide = new Intellihide.Intellihide(this._settings, this._monitorIndex);

        this._updateHotCorner(false);
        this._updateStaticBox();
        this._bindTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, 100, this._bindUIChanges.bind(this));
    }

    hide(animationTime, trigger) {
        DEBUG("hide(" + trigger + ")");
        if(this._preventHide) return;

        let anchor_y = PanelBox.get_pivot_point()[1],
            delta_y = -PanelBox.height;
        if(anchor_y < 0) delta_y = -delta_y;
        let mouse = global.get_pointer(),
            mouse_is_over = (mouse[1] >= this._staticBox.y1 &&
                                 mouse[1] < this._staticBox.y2 &&
                                 mouse[0] >= this._staticBox.x1 &&
                                 mouse[0] < this._staticBox.x2);
        if(trigger == "mouse-left" && mouse_is_over) return;

        if(this._animationActive) {
            PanelBox.remove_all_transitions();
            this._animationActive = false;
        }

        this._animationActive = true;
        PanelBox.ease({
            y: this._base_y + delta_y,
            duration: animationTime * 1000,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._animationActive = false;
                PanelBox.hide();
                this._updateHotCorner(true);
            }
        });
    }

    show(animationTime, trigger) {
        DEBUG("show(" + trigger + ")");
        if(trigger == "mouse-enter"
           && this._settings.get_boolean('mouse-triggers-overview')) {
            Main.overview.show();
        }

        if(this._animationActive) {
            PanelBox.remove_all_transitions();
            this._animationActive = false;
        }

        this._updateHotCorner(false);
        PanelBox.show();
        if(trigger == "destroy"
           || (
               trigger == "showing-overview"
               && global.get_pointer()[1] < PanelBox.height
               && this._settings.get_boolean('hot-corner')
              )
          ) {
            PanelBox.y = this._base_y;
        } else {
            this._animationActive = true;
            PanelBox.ease({
                y: this._base_y,
                duration: animationTime * 1000,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    this._animationActive = false;
                    this._updateStaticBox();
                }
            });
        }
    }

    _handleMenus() {
        if(!Main.overview.visible) {
            let blocker = Main.panel.menuManager.activeMenu;
            if(blocker == null) {
                this.hide(
                    this._settings.get_double('animation-time-autohide'),
                    "mouse-left"
                );
            } else {
                this._blockerMenu = blocker;
                this._menuEvent = this._blockerMenu.connect(
                    'open-state-changed',
                    (menu, open) => {
                        if(!open && this._blockerMenu !== null) {
                            this._blockerMenu.disconnect(this._menuEvent);
                            this._menuEvent=null;
                            this._blockerMenu=null;
                            this._handleMenus();
                        }
                    }
                );
            }
        }
    }

    _handleShortcut() {
        var delay_time = this._settings.get_double('shortcut-delay');
        if(this._shortcutTimeout) {
            if(this._shortcutTimeout !== true) {
                GLib.source_remove(this._shortcutTimeout);
            }
            this._shortcutTimeout = null;
            if(delay_time < 0.05
               || this._settings.get_boolean('shortcut-toggles')) {
                this._intellihideBlock = false;
                this._preventHide = false;
                this.hide(
                    this._settings.get_double('animation-time-autohide'),
                    "shortcut"
                );
                return;
            }
        }

        // If setting 'shortcut-toggles' is false, repeatedly pressing the
        // shortcut should prevent the bar from hiding
        if(!this._preventHide || this._intellihideBlock) {
            this._intellihideBlock = true;
            this._preventHide = true;

            if(delay_time > 0.05) {
                this.show(delay_time/5.0, "shortcut");

                this._shortcutTimeout = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT, delay_time*1200,
                    () => {
                        this._preventHide = false;
                        this._intellihideBlock = false;
                        this._handleMenus();
                        this._shortcutTimeout = null;
                        return false;
                    }
                );
            } else {
                this.show(
                    this._settings.get_double('animation-time-autohide'),
                    "shortcut"
                );
                this._shortcutTimeout = true;
            }
            // Key-focus the "Activities" button
            //  Currently, this is deactivated because we can't make sure that
            //  the panel doesn't hide as long as it has the key focus.
            // Main -> panel -> _leftBox -> (StBin) -> (panel-button)
            // Main.panel._leftBox.first_child.first_child.grab_key_focus();
        }
    }

    _disablePressureBarrier() {
        if(this._panelBarrier && this._panelPressure) {
            this._panelPressure.removeBarrier(this._panelBarrier);
            this._panelBarrier.destroy();
        }
    }

    _initPressureBarrier() {
        this._panelPressure = new Layout.PressureBarrier(
            this._settings.get_int('pressure-threshold'),
            this._settings.get_int('pressure-timeout'),
            ShellActionMode.NORMAL
        );
        this._panelPressure.connect(
            'trigger',
            (barrier) => {
                if ( (Main.layoutManager.primaryMonitor.inFullscreen) && (!this._settings.get_boolean('mouse-sensitive-fullscreen-window')) ) {
                    return;
                }
                this.show(
                    this._settings.get_double('animation-time-autohide'),
                    "mouse-enter"
                );
            }
        );
        let anchor_y = PanelBox.get_pivot_point()[1],
            direction = Meta.BarrierDirection.POSITIVE_Y;
        if(anchor_y < 0) {
            anchor_y -= PanelBox.height;
            direction = Meta.BarrierDirection.NEGATIVE_Y;
        }
        this._panelBarrier = new Meta.Barrier({
            display: global.display,
            x1: PanelBox.x,
            x2: PanelBox.x + PanelBox.width,
            y1: this._base_y - anchor_y,
            y2: this._base_y - anchor_y,
            directions: direction
        });
        this._panelPressure.addBarrier(this._panelBarrier);
    }

    _updateStaticBox() {
        DEBUG("_updateStaticBox()");
        let anchor_y = PanelBox.get_pivot_point()[1];
        this._staticBox.init_rect(
            PanelBox.x, PanelBox.y-anchor_y, PanelBox.width, PanelBox.height
        );
        this._intellihide.updateTargetBox(this._staticBox);
    }

    _updateHotCorner(panel_hidden) {
        let HotCorner = null;
        for(var i = 0; i < Main.layoutManager.hotCorners.length; i++){
          let hc = Main.layoutManager.hotCorners[i];
          if(hc){
            HotCorner = hc;
            break;
          }
        }
        if(HotCorner){
          if(!panel_hidden || this._settings.get_boolean('hot-corner')) {
              HotCorner.setBarrierSize(PanelBox.height);
          } else {
              GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, function () {
                  HotCorner.setBarrierSize(0)
              });
          }
        }
    }

    _updateSettingsHotCorner() {
        this.hide(0.1, "hot-corner-setting-changed");
    }

    _updateSettingsMouseSensitive() {
        if(this._settings.get_boolean('mouse-sensitive')) {
            this._disablePressureBarrier();
            this._initPressureBarrier();
        } else this._disablePressureBarrier();
    }

    _updateIntellihideStatus() {
        if(this._settings.get_boolean('enable-intellihide')) {
            this._intellihideBlock = false;
            this._preventHide = false;
            this._intellihide.enable();
        } else {
            this._intellihide.disable();
            this._intellihideBlock = true;
            this._preventHide = false;
            this.hide(0, "init");
        }
    }

    _updatePreventHide() {
        if(this._intellihideBlock) return;

        this._preventHide = !this._intellihide.getOverlapStatus();
        let animTime = this._settings.get_double('animation-time-autohide');
        if(this._preventHide)
            this.show(animTime, "intellihide");
        else if(!Main.overview.visible)
            this.hide(animTime, "intellihide");
    }

    _bindUIChanges() {
        let monitorManager;
        if (global.screen)
            monitorManager = global.screen;         // mutter < 3.29
        else
            monitorManager = Main.layoutManager;    // mutter >= 3.29

        this._signalsHandler = new Convenience.GlobalSignalsHandler();
        this._signalsHandler.add(
            [
                Main.overview,
                'showing',
                () => {
                    this.show(
                        this._settings.get_double('animation-time-overview'),
                        "showing-overview"
                    );
                }
            ],
            [
                Main.overview,
                'hiding',
                () => {
                    this.hide(
                        this._settings.get_double('animation-time-overview'),
                        "hiding-overview"
                    );
                }
            ],
            [
                Main.panel,
                'leave-event',
                this._handleMenus.bind(this)
            ],
            [
                PanelBox,
                'notify::anchor-y',
                () => {
                    this._updateStaticBox();
                    this._updateSettingsMouseSensitive();
                }
            ],
            [
                monitorManager,
                'monitors-changed',
                () => {
                    this._base_y = PanelBox.y;
                    this._updateStaticBox();
                    this._updateSettingsMouseSensitive();
                }
            ],
            [
                this._intellihide,
                'status-changed',
                this._updatePreventHide.bind(this)
            ]
        );

        Main.wm.addKeybinding("shortcut-keybind",
            this._settings, Meta.KeyBindingFlags.NONE,
            ShellActionMode.NORMAL,
            this._handleShortcut.bind(this)
        );

        this._updateIntellihideStatus();
    }

    _bindSettingsChanges() {
        this._signalsHandler = new Convenience.GlobalSignalsHandler();
        this._signalsHandler.addWithLabel("settings",
            [
                this._settings,
                'changed::hot-corner',
                this._updateSettingsHotCorner.bind(this)
            ],
            [
                this._settings,
                'changed::mouse-sensitive',
                this._updateSettingsMouseSensitive.bind(this)
            ],
            [
                this._settings,
                'changed::pressure-timeout',
                this._updateSettingsMouseSensitive.bind(this)
            ],
            [
                this._settings,
                'changed::pressure-threshold',
                this._updateSettingsMouseSensitive.bind(this)
            ],
            [
                this._settings,
                'changed::enable-intellihide',
                this._updateIntellihideStatus.bind(this)
            ],
            [
                this._settings,
                'changed::enable-active-window',
                this._updateIntellihideStatus.bind(this)
            ]
        );
    }

    destroy() {
        GLib.source_remove(this._bindTimeoutId);
        this._intellihide.destroy();
        this._signalsHandler.destroy();
        Main.wm.removeKeybinding("shortcut-keybind");
        this._disablePressureBarrier();

        MessageTray._tween = this._oldTween;
        this.show(0, "destroy");

        Main.layoutManager.removeChrome(PanelBox);
        Main.layoutManager.addChrome(PanelBox, {
            affectsStruts: true,
            trackFullscreen: true
        });
    }
};
