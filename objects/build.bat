set PATH=%PATH%;"c:\program files\cmake\bin"
cmake -Dall=OFF -Dmathmore=OFF -Dbuiltin_zlib=ON -Dgfal=OFF -Dbuiltin_freetype=ON -Dbuiltin_ftgl=ON -Droofit=OFF -Dfftw3=OFF -DCMAKE_INSTALL_PREFIX=".\export" -G"Visual Studio 16 2019" -A Win32 ..\
cmake --build . --config RelWithDebInfo
