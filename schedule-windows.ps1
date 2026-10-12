# Programa la búsqueda diaria de vuelos en el Programador de tareas de Windows.
# Uso:  .\schedule-windows.ps1            (todos los días a las 9:07 AM)
#       .\schedule-windows.ps1 -At 20:15  (otra hora)
param([string]$At = '9:07am')

$dir = $PSScriptRoot
$action = New-ScheduledTaskAction -Execute "$dir\run-search.cmd" -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -Daily -At $At
# StartWhenAvailable: si la computadora estaba apagada a esa hora, corre en cuanto se encienda
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask -TaskName 'Vuelos MEX-BUD' -Action $action -Trigger $trigger `
  -Settings $settings -Description 'Busca vuelos CDMX-Budapest julio 2027 en Google Flights' -Force | Out-Null

Write-Host "Listo: la busqueda correra todos los dias a las $At."
Write-Host "Para probarla ahora:   Start-ScheduledTask -TaskName 'Vuelos MEX-BUD'"
Write-Host "Para quitarla:         Unregister-ScheduledTask -TaskName 'Vuelos MEX-BUD'"
