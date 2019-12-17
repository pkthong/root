cmake -Dall=OFF -Dmathmore=OFF -Dbuiltin_zlib=ON -Dbuiltin_lzma=ON -Dgfal=OFF -Dbuiltin_freetype=ON -Dbuiltin_ftgl=ON -Droofit=OFF -Dfftw3=OFF -DCMAKE_INSTALL_PREFIX="../export" -Dtesting=ON -G"Visual Studio 16 2019" -A x64 -Thost=x64 ..\
rem cmake --build . --config RelWithDebInfo --target ALL_BUILD
