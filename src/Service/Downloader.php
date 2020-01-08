<?php

namespace App\Service;

use YoutubeDl\YoutubeDl;

final class Downloader implements DownloaderInterface
{
  private $downloadDir;
  private $uuidGenerator;

  public function __construct(string $downloadDir, UUIDGeneratorInterface $uuidGenerator)
  {
    if (!is_dir($downloadDir)) {
      mkdir($downloadDir, 0777, true);
    }

    $this->downloadDir = rtrim(rtrim($downloadDir, '/'), '\\');
    $this->uuidGenerator = $uuidGenerator;
  }

  public function download(string $url)
  {
    $downloader = new YoutubeDl([
      'extract-audio' => true,
      'audio-format' => 'mp3',
      'audio-quality' => 0, // best
      'output' => $this->uuidGenerator->generate() . '.%(ext)s',
    ]);
    $downloader->setDownloadPath($this->getDownloadDirectory());
    $video = $downloader->download($url);

    return $this->getDownloadDirectory() . '/' . $video['_filename'];
  }

  public function getDownloadDirectory(): string
  {
    return $this->downloadDir;
  }
}
