#!/bin/bash
set -e

xfce4-terminal --hold -e "bash -x /lib/live/mount/medium/term.sh"
xdg-open http://localhost:3000

