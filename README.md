# companion-module-panasonic-cameras

Companion module for Panasonic's IP remote controllable cameras. It supports **all AW series PTZ cameras** as well as other box camera and camcorder models which use the same remote control protocol.

Current camera support is mainly based on "HD/4K Integrated Camera Interface Specifications" version 1.12 from Apr. 27, 2020,
"HD/4K Integrated Camera Interface Specifications" Compatible model Table from Mar. 1, 2025,
"CX350/CX4000 Control Using PTZ Control Protocol" Rev.3.00 from Jan. 25, 2022
and the model specific "Supplement for Web Control" specifications.


## Supported camera models

**PTZ cameras**

- **HE2:** AW-HE2
- **HE50:** AW-HE50, AW-HE60
- **HE120:** AW-HE120
- **HE130:** AW-HE130, AW-HN130
- **HE40 series:** AW-HE35, AW-HE38, AW-HE40, AW-HE48, AW-HE58, AW-HE65, AW-HE70, AW-HN38, AW-HN40, AW-HN65
- **UE70 series:** AW-HE42, AW-HE68, AW-HE75, AW-UE63, AW-UE65, AW-UE70, AW-UN70
- **UE4:** AW-UE4
- **UE20 series:** AW-HE20, AW-UE20
- **UE50 series:** AW-UE30, AW-UE40, AW-UE50
- **UE80:** AW-UE80
- **UE100:** AW-UE100
- **UE150 series:** AW-HE145, AW-UE150, AW-UE155, AW-UN145
- **UE150A:** AW-UE150A
- **UE160:** AW-UE160

**Outdoor PTZ cameras**

- **HR140:** AW-HR140
- **UR100:** AW-UR100

**Box cameras**

- **UB50:** AK-UB10, AK-UB50
- **UB300:** AK-UB300

**Camcorders**

- **CX350 series:** AG-CX350, AG-CX200, AJ-CX4000, AJ-UPX360, AJ-UPX900


**_Not all models support all actions, variables and feedbacks. The lists below cover the full feature set; the module auto-sorts them so that only the entries that work with your connected model are offered._**


## Actions

**Pan/Tilt**

- Pan/Tilt - Move
- Pan/Tilt - Home Position
- Pan/Tilt - Speed

**Lens**

- Lens - Zoom
- Lens - Zoom Speed Control
- Lens - Zoom Speed
- Lens - Focus
- Lens - Focus Speed Control
- Lens - Focus Speed
- Lens - Follow Focus
- Lens - Focus Mode
- Lens - Focus Push Auto
- Lens - Image Stabilization Mode

**Exposure**

- Exposure - Iris
- Exposure - Iris Mode
- Exposure - ND Filter
- Exposure - Shutter
- Exposure - Shutter Step Up
- Exposure - Shutter Step Down
- Exposure - Night Mode

**Image**

- Image - Gain
- Image - Chroma Level
- Image - Chroma Phase
- Image - Digital Noise Reduction
- Image - Dynamic Range Stretch
- Image - Pedestal
- Image - Red / Blue / Green Pedestal
- Image - Red / Blue / Green Gain
- Image - White Balance Mode
- Image - Execute AWC/AWB
- Image - Execute ABC/ABB
- Image - Color Temperature
- Image - Shooting Mode

**Preset**

- Preset - Memory Operation (Recall / Memorize / Clear)
- Preset - Reset Selected / Completed State
- Preset - Recall Scope
- Preset - Clear All
- Preset - Recall Velocity
- Preset - Recall Speed Table
- Preset - Recall Velocity Unit
- Preset - Recall Time

**Auto Tracking**

- Auto Tracking - Mode
- Auto Tracking - Angle
- Auto Tracking - Start/Stop Tracking

**Audio**

- Audio - Volume Level

**System**

- System - Power
- System - Restart
- System - Red / Green / Yellow Tally (legacy models: single Tally)
- System - Color Bar
- System - Installation Position
- System - SD Card Recording Control

**Streaming**

- Streaming - SRT Caller Control
- Streaming - MPEG-TS Output Control
- Streaming - RTMP Push Control

**Other**

- Custom Command


## Feedbacks

**System**

- System - Error Condition
- System - Power State
- System - Color Bar State
- System - Red / Green / Yellow Tally State
- System - Install Position
- System - Live Image

**Lens**

- Lens - Focus Mode Auto
- Lens - Iris Mode Auto
- Lens - Image Stabilization
- Lens - Zoom Control

**Exposure**

- Exposure - ND Filter
- Exposure - Shutter
- Exposure - Night Mode

**Image**

- Image - Gain
- Image - Shooting Mode
- Image - Chroma Level
- Image - Digital Noise Reduction
- Image - Dynamic Range Stretch
- Image - White Balance

**Preset**

- Preset - Recall Speed/Time
- Preset - Recall Scope
- Preset - Selected / Active
- Preset - Recall Completion Notification
- Preset - Memory State
- Preset - Thumbnail

**Auto Tracking**

- Auto Tracking - On/Off
- Auto Tracking - Angle
- Auto Tracking - Status

**Recording & Streaming**

- Recording - State
- Recording - SD card inserted
- Streaming - RTMP Push State
- Streaming - SRT Caller State
- Streaming - MPEG-TS Output State

**Audio**

- Audio - Volume Level


## Variables

| Variable | Description |
| --- | --- |
| `$(model)` | Model of camera |
| `$(title)` | Title of camera |
| `$(version)` | Firmware Version |
| `$(error)` | Error Code |
| `$(installMode)` | Install Position |
| `$(power)` | Power Status |
| `$(colorbar)` | Color Bar Status |
| `$(tally)` | Red Tally Status |
| `$(tally2)` | Green Tally Status |
| `$(tally3)` | Yellow Tally Status |
| `$(focusMode)` | Focus Mode |
| `$(whiteBalance)` | White Balance Mode |
| `$(colorTemperature)` | Color Temperature |
| `$(filter)` | ND Filter |
| `$(gain)` | Gain |
| `$(shootingMode)` | Shooting Mode |
| `$(nightMode)` | Night Mode |
| `$(shutter)` | Shutter Mode |
| `$(shutterStep)` | Shutter Step |
| `$(ois)` | O.I.S. |
| `$(ptSpeed)` | Pan/Tilt Speed |
| `$(pSpeed)` | Pan Speed |
| `$(tSpeed)` | Tilt Speed |
| `$(panPosition)` | Pan Position |
| `$(tiltPosition)` | Tilt Position |
| `$(panPositionDeg)` | Pan Position ° |
| `$(tiltPositionDeg)` | Tilt Position ° |
| `$(zoomPosition)` | Zoom Position |
| `$(zoomPositionPct)` | Zoom Position % |
| `$(zoomPositionBar)` | Zoom Position (bar graph) |
| `$(zoomSpeed)` | Zoom Speed Control |
| `$(zSpeed)` | Zoom Speed |
| `$(focusPosition)` | Focus Position |
| `$(focusPositionPct)` | Focus Position % |
| `$(focusPositionBar)` | Focus Position (bar graph) |
| `$(focusSpeed)` | Focus Speed Control |
| `$(fSpeed)` | Focus Speed |
| `$(irisPosition)` | Iris Position |
| `$(irisPositionPct)` | Iris Position % |
| `$(irisPositionBar)` | Iris Position (bar graph) |
| `$(irisVolume)` | Iris Volume |
| `$(irisMode)` | Iris Mode |
| `$(irisF)` | Iris F No. |
| `$(masterPed)` | Master Pedestal |
| `$(chromaLevel)` | Chroma Level |
| `$(chromaPhase)` | Chroma Phase |
| `$(dnr)` | Digital Noise Reduction |
| `$(drs)` | Dynamic Range Stretch |
| `$(redGain)` | Red Gain |
| `$(blueGain)` | Blue Gain |
| `$(greenGain)` | Green Gain |
| `$(redPed)` | Red Pedestal |
| `$(bluePed)` | Blue Pedestal |
| `$(greenPed)` | Green Pedestal |
| `$(presetScope)` | Preset Recall Scope |
| `$(presetCompleted)` | Preset # Completed |
| `$(presetSelected)` | Preset # Selected |
| `$(presetMemory)` | Used Preset Memory slots |
| `$(presetSpeed)` | Preset Recall Speed/Time |
| `$(presetSpeedTable)` | Preset Recall Speed Table |
| `$(presetSpeedUnit)` | Preset Recall Speed Unit |
| `$(recording)` | SD Card Recording Status |
| `$(streamingRTMP)` | RTMP Push Status |
| `$(streamingSRT)` | SRT Caller Status |
| `$(streamingTS)` | MPEG-TS Output Status |
| `$(videoFormat)` | Video Format |
| `$(autotrackingMode)` | Autotracking Mode |
| `$(autotrackingAngle)` | Autotracking Angle |
| `$(autotrackingStatus)` | Autotracking Status |
| `$(audioVolumeLevel1…N)` | Audio Volume Level per Channel (dB) |
