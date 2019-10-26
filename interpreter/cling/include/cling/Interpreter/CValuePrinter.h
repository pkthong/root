//--------------------------------------------------------------------*- C++ -*-
// CLING - the C++ LLVM-based InterpreterG :)
// author:  Vassil Vassilev <vasil.georgiev.vasilev@cern.ch>
//
// This file is dual-licensed: you can choose to license it under the University
// of Illinois Open Source License or the GNU Lesser General Public License. See
// LICENSE.TXT for details.
//------------------------------------------------------------------------------

#if defined(_WIN32) || defined(_WIN64)
#define DLL_EXPORT __declspec(dllexport)
#else
#define DLL_EXPORT
#endif

#ifndef CLING_VALUEPRINTERC_H
#define CLING_VALUEPRINTERC_H
#ifdef __cplusplus
extern "C"
#endif
    DLL_EXPORT void
    cling_PrintValue(void* /*cling::Value**/ V);

#endif // CLING_VALUEPRINTERC_H
