# Copyright (c) 2018 mushanshitiancai

# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
# 
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
# 
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.

# Author: https://github.com/mushanshitiancai/vscode-paste-image

param($imagePath)

# Adapted from https://github.com/octan3/img-clipboard-dump/blob/master/dump-clipboard-png.ps1

Add-Type -Assembly PresentationCore
$img = [Windows.Clipboard]::GetImage()

if ($img -eq $null) {
    "no image"
    Exit 1
}

if (-not $imagePath) {
    "no image"
    Exit 1
}

$fcb = new-object Windows.Media.Imaging.FormatConvertedBitmap(
    $img, 
    [Windows.Media.PixelFormats]::Rgb24, 
    $null, 
    0)
$stream = [IO.File]::Open($imagePath, "OpenOrCreate")
$encoder = New-Object Windows.Media.Imaging.PngBitmapEncoder
$encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($fcb)) | out-null
$encoder.Save($stream) | out-null
$stream.Dispose() | out-null

$imagePath