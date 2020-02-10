<?php

namespace App\Controller;

use Sensio\Bundle\FrameworkExtraBundle\Configuration\Route;
use App\Form\AlbumType;
use App\Service\PackageBuilder;
use App\Service\RemoteImageDownloader;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class MainController extends AbstractController
{
  /**
   * @Route("/", name="home", methods={"GET"})
   */
  public function index()
  {
    $form = $this->createForm(AlbumType::class);
    return $this->render("main/index.html.twig", [
      'form' => $form->createView()
    ]);
  }

  /**
   * @Route("/submit", name="submit")
   */
  public function process(Request $request, PackageBuilder $packageBuilder, RemoteImageDownloader $imgDownloader)
  {
    $form = $this->createForm(AlbumType::class);
    $form->handleRequest($request);

    if (!$form->isValid()) {
      $html = $this->renderView('form/_albumie.html.twig', [
        'form' => $form->createView()
      ]);
      return new Response($html, 400);
    }

    if (null !== $form->get('image')->getData()) {
      $imageFileName = $imgDownloader->download($form->get('image')->getData());
      $packageBuilder->setCoverImage($imageFileName);
    }

    $tracks = $form->get('tracks')->getData();
    foreach ($tracks as $track) {
      $packageBuilder->add($track);
    }
    $archiveFilename = $packageBuilder->build();

    foreach ($packageBuilder->getResidualFiles() as $residualFilename) {
      unlink($residualFilename);
    }

    $archiveName = basename($archiveFilename);
    $archiveName = preg_replace('/\\.[^.\\s]{3,4}$/', '', $archiveName);
    return $this->json(['archiveName' => $archiveName]);
  }

  /**
   * @Route("/download/{archiveName}", name="download")
   */
  public function download(string $archiveName, PackageBuilder $packageBuilder)
  {
    $archiveFilename = $packageBuilder->getArchivesDirectory() . '/' . $archiveName . '.zip';
    if (!is_file($archiveFilename)) throw new NotFoundHttpException("Archive not found: $archiveFilename");

    $response = new StreamedResponse(function () use ($archiveFilename) {
      $outputStream = fopen('php://output', 'wb');
      $fileStream = fopen($archiveFilename, 'r');
      try {
        stream_copy_to_stream($fileStream, $outputStream);
      } finally {
        fclose($fileStream);
        fclose($outputStream);
      }
      unlink($archiveFilename);
    });
    $response->headers->set('Content-Type', 'application/zip');
    $response->headers->set('Content-Disposition:', ResponseHeaderBag::DISPOSITION_ATTACHMENT);
    return $response;
  }

  /**
   * @Route("/javascript-disabled", name="nojs")
   */
  public function nojs()
  {
    return $this->render("no-js.html.twig");
  }
}
