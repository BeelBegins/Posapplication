# Domain logic

Keep domain modules pure where possible: no Electron, SQLite, renderer or
Capacitor imports. Local FBR/payment/tax calculations are estimates, never the
final server authority. Cover boundary values, returns, rounding and replay in
unit tests.
