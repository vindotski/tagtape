<?php

namespace App\Service;

interface Downloader
{
  public function download(string $url);

  public function getDownloadDirectory(): string;
}
