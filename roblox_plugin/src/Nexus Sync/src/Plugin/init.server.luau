
local RunService = game:GetService("RunService")

plugin.Name = script.Parent.Name

local Settings = require(script.Modules.Settings)
local Cleanup = require(script.Modules.Cleanup)
local Output = require(script.Modules.Output)
local Server = require(script.Modules.Server)

Settings:Load()
local Widget
if RunService:IsEdit() then
	Widget = require(script.Modules.Widget)
	Widget:Load()
end
Output:Load()

local function Deactivate()
	Cleanup:Clear()
	if Widget then
		Widget:Close()
	end
end

Cleanup:Hook().Ping = task.spawn(function()
	while task.wait(1) do
		Server:Update()
	end
end)

plugin.Unloading:Connect(function()
	Deactivate()
end)

plugin.Deactivation:Connect(function()
	Deactivate()
end)
