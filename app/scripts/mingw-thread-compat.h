/* Build-only API declarations absent from MinGW-w64 11.0.1. MSVC builds do not
 * include this file. Layout matches the Windows SDK's public Win32 ABI:
 * https://learn.microsoft.com/windows/win32/api/processthreadsapi/ns-processthreadsapi-thread_power_throttling_state
 */
#ifdef __MINGW32__
#include <windows.h>
#ifndef THREAD_POWER_THROTTLING_CURRENT_VERSION
#define THREAD_POWER_THROTTLING_CURRENT_VERSION 1UL
#define THREAD_POWER_THROTTLING_EXECUTION_SPEED 0x1UL
typedef struct {
    ULONG Version;
    ULONG ControlMask;
    ULONG StateMask;
} THREAD_POWER_THROTTLING_STATE;
#endif
#endif
