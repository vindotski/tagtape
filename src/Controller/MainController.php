<?php

namespace App\Controller;

use App\Entity\TrackMetadata;
use App\Form\AlbumType;
use App\Service\PackageBuilder;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;
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

            $response = new BinaryFileResponse($archiveFilename);
            $response->setContentDisposition(ResponseHeaderBag::DISPOSITION_ATTACHMENT);
            return $response;
        }

        return $this->render('main/index.html.twig', [
            'form' => $form->createView()
        ]);
    }
}
