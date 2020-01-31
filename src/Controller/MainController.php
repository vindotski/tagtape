<?php

namespace App\Controller;

use App\Entity\TrackMetadata;
use App\Form\AlbumType;
use App\Service\PackageBuilder;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\Routing\Annotation\Route;

class MainController extends AbstractController
{
    /**
     * @Route("/", name="home")
     */
    public function index(Request $request, PackageBuilder $packageBuilder)
    {
        $form = $this->createForm(AlbumType::class);

        $form->handleRequest($request);

        if ($form->isSubmitted() && $form->isValid()) {
            $tracks = $form->get('tracks')->getData();
            foreach ($tracks as $track) {
                $packageBuilder->add($track);
            }
            $archiveFilename = $packageBuilder->build();

            foreach ($packageBuilder->getResidualFiles() as $residualFilename) {
                unlink($residualFilename);
            }

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

        return $this->render('main/index.html.twig', [
            'form' => $form->createView()
        ]);
    }

    /**
     * @Route("/javascript-disabled", name="nojs")
     */
    public function nojs(Request $request, PackageBuilder $packageBuilder)
    {
        return $this->render('main/no-js.html.twig');
    }
}
