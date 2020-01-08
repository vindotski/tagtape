<?php

namespace App\Service;

interface DownloaderInterface
{
  public function download(string $url);

  public function getDownloadDirectory(): string;
}
